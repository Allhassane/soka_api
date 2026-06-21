import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { norm, digitsOnly } from './import.util';
import { CIVILITY_ALIASES, STRUCTURE_LEVELS_DOWN } from './import.constants';

interface StructNode {
  uuid: string;
  name: string;
  parentUuid: string | null;
  level: string;
}

export interface StructureResolution {
  uuid?: string;
  error?: string;
}

/**
 * Charge en mémoire les référentiels + l'arbre des structures + l'index des membres,
 * puis offre des méthodes de résolution (valeur normalisée → uuid). À recharger via
 * `load()` au début de chaque import (reflète les données courantes).
 */
@Injectable()
export class ImportReferenceService {
  private civilities = new Map<string, string>();
  private maritalStatus = new Map<string, string>();
  private countries = new Map<string, string>();
  private cities = new Map<string, string>();
  private formations = new Map<string, string>();
  private jobs = new Map<string, string>();
  private organisationCities = new Map<string, string>();
  private departments = new Map<string, string>();
  private divisions = new Map<string, string>();
  private responsibilities = new Map<string, string>();

  /** level -> (nom normalisé -> noeuds) */
  private structIndex = new Map<string, Map<string, StructNode[]>>();

  private membersByMatricule = new Map<string, string>();
  private membersByPhone = new Map<string, string>();
  private totalMembers = 0;

  constructor(private readonly ds: DataSource) {}

  private async loadSimple(table: string): Promise<Map<string, string>> {
    const rows: Array<{ uuid: string; name: string }> = await this.ds.query(
      `SELECT uuid, name FROM \`${table}\` WHERE uuid IS NOT NULL`,
    );
    const m = new Map<string, string>();
    for (const r of rows) if (r.name != null) m.set(norm(r.name), r.uuid);
    return m;
  }

  async load(): Promise<void> {
    [
      this.civilities,
      this.maritalStatus,
      this.countries,
      this.cities,
      this.formations,
      this.jobs,
      this.organisationCities,
      this.departments,
      this.divisions,
      this.responsibilities,
    ] = await Promise.all([
      this.loadSimple('civilities'),
      this.loadSimple('marital_status'),
      this.loadSimple('countries'),
      this.loadSimple('cities'),
      this.loadSimple('formations'),
      this.loadSimple('jobs'),
      this.loadSimple('organisation_cities'),
      this.loadSimple('departments'),
      this.loadSimple('divisions'),
      this.loadSimple('responsibilities'),
    ]);

    // Arbre des structures (jointure niveau via level_uuid ou level_id).
    const sRows: Array<{
      uuid: string;
      name: string;
      parent_uuid: string | null;
      level: string | null;
    }> = await this.ds.query(
      `SELECT s.uuid AS uuid, s.name AS name, s.parent_uuid AS parent_uuid,
              COALESCE(l1.name, l2.name) AS level
       FROM structures s
       LEFT JOIN levels l1 ON l1.uuid = s.level_uuid
       LEFT JOIN levels l2 ON l2.id = s.level_id
       WHERE s.deleted_at IS NULL`,
    );
    this.structIndex = new Map();
    for (const r of sRows) {
      if (!r.uuid || !r.level) continue;
      const lvl = String(r.level).toUpperCase();
      if (!this.structIndex.has(lvl)) this.structIndex.set(lvl, new Map());
      const byName = this.structIndex.get(lvl)!;
      const key = norm(r.name);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push({
        uuid: r.uuid,
        name: r.name,
        parentUuid: r.parent_uuid,
        level: lvl,
      });
    }

    // Index des membres pour le rapprochement.
    const mRows: Array<{ uuid: string; matricule: string | null; phone: string | null }> =
      await this.ds.query(`SELECT uuid, matricule, phone FROM members`);
    this.membersByMatricule = new Map();
    this.membersByPhone = new Map();
    this.totalMembers = mRows.length;
    for (const r of mRows) {
      if (r.matricule && String(r.matricule).trim()) {
        this.membersByMatricule.set(norm(r.matricule), r.uuid);
      }
      const ph = digitsOnly(r.phone);
      if (ph.length === 10 && !this.membersByPhone.has(ph)) {
        this.membersByPhone.set(ph, r.uuid);
      }
    }
  }

  get totalMembersInDb(): number {
    return this.totalMembers;
  }

  resolveCivility(value: string): string | null {
    const n = norm(value);
    if (!n) return null;
    if (this.civilities.has(n)) return this.civilities.get(n)!;
    const alias = CIVILITY_ALIASES[n];
    if (alias) return this.civilities.get(norm(alias)) ?? null;
    return null;
  }
  resolveMarital(v: string): string | null { return this.maritalStatus.get(norm(v)) ?? null; }
  resolveCountry(v: string): string | null { return this.countries.get(norm(v)) ?? null; }
  resolveCity(v: string): string | null { return this.cities.get(norm(v)) ?? null; }
  resolveFormation(v: string): string | null { return this.formations.get(norm(v)) ?? null; }
  resolveJob(v: string): string | null { return this.jobs.get(norm(v)) ?? null; }
  resolveOrganisationCity(v: string): string | null { return this.organisationCities.get(norm(v)) ?? null; }
  resolveDepartment(v: string): string | null { return this.departments.get(norm(v)) ?? null; }
  resolveDivision(v: string): string | null { return this.divisions.get(norm(v)) ?? null; }
  resolveResponsibility(v: string): string | null { return this.responsibilities.get(norm(v)) ?? null; }

  /** Rapprochement : matricule prioritaire, sinon téléphone (10 chiffres). */
  matchMember(matricule: string, phone10: string): string | null {
    const m = norm(matricule);
    if (m && this.membersByMatricule.has(m)) return this.membersByMatricule.get(m)!;
    if (phone10 && this.membersByPhone.has(phone10)) return this.membersByPhone.get(phone10)!;
    return null;
  }

  /**
   * Résout la structure d'une ligne : ancre au CENTRE puis descend CHAPITRE→…→SOUS_GROUPE
   * par la chaîne parentale. Renvoie l'uuid de la structure la plus spécifique trouvée,
   * ou une erreur explicite (niveau + valeur) si introuvable/ambigu.
   */
  resolveStructure(row: Record<string, string>): StructureResolution {
    const centre = (row['CENTRE'] ?? '').trim();
    let resolved = this.structIndex.get('CENTRE')?.get(norm(centre)) ?? [];
    if (!resolved.length) {
      return { error: `Structure introuvable au niveau CENTRE : « ${centre} »` };
    }
    let resolvedLevel = 'CENTRE';
    for (const lvl of STRUCTURE_LEVELS_DOWN.slice(1)) {
      const val = (row[lvl] ?? '').trim();
      if (!val) break;
      const parentSet = new Set(resolved.map((n) => n.uuid));
      const cands = (this.structIndex.get(lvl)?.get(norm(val)) ?? []).filter(
        (n) => n.parentUuid && parentSet.has(n.parentUuid),
      );
      if (!cands.length) {
        return {
          error: `Structure introuvable au niveau ${lvl} : « ${val} » (sous « ${resolved[0].name} »)`,
        };
      }
      resolved = cands;
      resolvedLevel = lvl;
    }
    if (resolved.length > 1) {
      return {
        error: `Structure ambiguë : ${resolved.length} correspondances au niveau ${resolvedLevel}`,
      };
    }
    return { uuid: resolved[0].uuid };
  }
}
