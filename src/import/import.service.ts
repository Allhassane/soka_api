import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In, FindOptionsWhere } from 'typeorm';
import * as XLSX from 'xlsx';
import { CANON, IMPORT_REQUIRED_COLUMNS } from './import.constants';
import { norm, digitsOnly, parseBool, parseDateFr } from './import.util';
import { ImportReferenceService } from './import-reference.service';
import { MemberEntity } from 'src/members/entities/member.entity';
import { MemberResponsibilityEntity } from 'src/member-responsibility/entities/member-responsibility.entity';
import { ImportFailureEntity } from './entities/import-failure.entity';
import { ImportBatchEntity } from './entities/import-batch.entity';
import { MemberAccountService } from 'src/users/member-account.service';

/** Sentinelle d'API pour le pseudo-groupe « échecs sans fichier » (batch_uuid NULL). */
export const NO_BATCH = 'none';

export type RowStatus = 'create' | 'update' | 'fail';

export interface RowOutcome {
  /** Ligne de données (1 = première ligne après l'en-tête). Affichage : line + 1. */
  line: number;
  matricule: string;
  phone: string;
  fullname: string;
  status: RowStatus;
  reasons: string[];
  raw: Record<string, string>;
}

export interface DryRunResult {
  total: number;
  to_create: number;
  to_update: number;
  to_fail: number;
  total_en_base: number;
  rows: RowOutcome[];
}

export interface CommitResult {
  total: number;
  created: number;
  updated: number;
  failed: number;
  total_en_base: number;
  rows: RowOutcome[];
  /** Identifiant du « fichier chargé » créé pour ce commit (cf. import_batches). */
  batch_uuid: string;
  /** Comptes de connexion créés par cet import (membres neufs + anciens qui n'en avaient pas). */
  accounts_created: number;
  /** Comptes dont l'identité a été réalignée sur la fiche (dont le téléphone de connexion). */
  accounts_updated: number;
  /**
   * Lignes écrites SANS compte utilisable, avec la raison. Remonté explicitement : un membre
   * sans compte ne peut pas se connecter et rien d'autre ne le signale.
   * Ces compteurs ne sont pas stockés dans `import_batches` (pas de migration) - ils valent
   * pour la réponse du commit.
   */
  accounts_skipped: { line: number; reason: string }[];
}

@Injectable()
export class ImportService {
  constructor(
    private readonly ref: ImportReferenceService,
    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,
    @InjectRepository(MemberResponsibilityEntity)
    private readonly memberRespRepo: Repository<MemberResponsibilityEntity>,
    @InjectRepository(ImportFailureEntity)
    private readonly failureRepo: Repository<ImportFailureEntity>,
    @InjectRepository(ImportBatchEntity)
    private readonly batchRepo: Repository<ImportBatchEntity>,
    /** Règle unique du compte de connexion, partagée avec `MemberService.store()`. */
    private readonly accounts: MemberAccountService,
  ) {}

  // ─────────────────────────── Parsing / format ───────────────────────────

  /**
   * Valide le format canonique (feuille « Membres » + 51 colonnes dans l'ordre) et renvoie
   * les lignes non vides indexées par en-tête canonique. Tout autre format => BadRequest.
   */
  parseAndValidate(buffer: Buffer): { rows: Record<string, string>[] } {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('Fichier illisible (un .xlsx est attendu).');
    }

    if (!wb.SheetNames.includes('Membres')) {
      throw new BadRequestException('Format invalide : feuille « Membres » introuvable.');
    }

    const ws = wb.Sheets['Membres'];
    const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      raw: false,
    });
    const header: unknown[] = matrix[0] || [];

    const normHeader = header.map((h) => norm(h));
    const normCanon = CANON.map((c) => norm(c));
    const conforme =
      normHeader.length >= normCanon.length &&
      normCanon.every((c, i) => normHeader[i] === c);

    if (!conforme) {
      throw new BadRequestException(
        'Format de fichier non conforme au modèle « exemple_fichier_importation.xlsx » ' +
          '(les colonnes attendues ne correspondent pas).',
      );
    }

    const rows: Record<string, string>[] = [];
    for (let i = 1; i < matrix.length; i++) {
      const r = matrix[i] || [];
      if (!r.some((c) => String(c ?? '').trim() !== '')) continue; // ligne vide
      const obj: Record<string, string> = {};
      CANON.forEach((col, ci) => {
        obj[col] = String(r[ci] ?? '').trim();
      });
      rows.push(obj);
    }

    return { rows };
  }

  // ─────────────────────────── Évaluation par ligne ───────────────────────────

  /** Évalue une ligne (validation + résolution structure + rapprochement) sans rien écrire. */
  private evaluateRow(row: Record<string, string>, index: number): RowOutcome {
    const reasons: string[] = [];

    for (const col of IMPORT_REQUIRED_COLUMNS) {
      if (!(row[col] ?? '').trim()) reasons.push(`Champ obligatoire manquant : « ${col} »`);
    }

    const g = norm(row['Genre']);
    if (g && g !== 'HOMME' && g !== 'FEMME') {
      reasons.push(`Genre invalide : « ${row['Genre']} » (attendu homme/femme)`);
    }

    const phone10 = digitsOnly(row['Téléphone']);
    if (phone10.length !== 10) {
      reasons.push(`Téléphone invalide : « ${row['Téléphone'] || '(vide)'} » (10 chiffres requis)`);
    }

    const struct = this.ref.resolveStructure(row);
    if (struct.error) reasons.push(struct.error);

    const fullname = `${row['Nom'] ?? ''} ${row['Prénom'] ?? ''}`.trim();
    const matricule = (row['Matricule'] ?? '').trim();

    if (reasons.length) {
      return { line: index + 1, matricule, phone: phone10, fullname, status: 'fail', reasons, raw: row };
    }

    const existing = this.ref.matchMember(matricule, phone10);
    return {
      line: index + 1,
      matricule,
      phone: phone10,
      fullname,
      status: existing ? 'update' : 'create',
      reasons: [],
      raw: row,
    };
  }

  /** Évaluation protégée : une ligne aberrante devient un « échec » (jamais de 500). */
  private safeEvaluateRow(row: Record<string, string>, index: number): RowOutcome {
    try {
      return this.evaluateRow(row, index);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        line: index + 1,
        matricule: (row['Matricule'] ?? '').trim(),
        phone: digitsOnly(row['Téléphone']),
        fullname: `${row['Nom'] ?? ''} ${row['Prénom'] ?? ''}`.trim(),
        status: 'fail',
        reasons: [`Erreur interne d'analyse de la ligne : ${msg}`],
        raw: row,
      };
    }
  }

  /** Dry-run : analyse complète du fichier, aucune écriture en base. */
  async dryRun(buffer: Buffer): Promise<DryRunResult> {
    const { rows } = this.parseAndValidate(buffer);
    await this.ref.load();

    const outcomes = rows.map((r, i) => this.safeEvaluateRow(r, i));
    return {
      total: outcomes.length,
      to_create: outcomes.filter((o) => o.status === 'create').length,
      to_update: outcomes.filter((o) => o.status === 'update').length,
      to_fail: outcomes.filter((o) => o.status === 'fail').length,
      total_en_base: this.ref.totalMembersInDb,
      rows: outcomes,
    };
  }

  // ─────────────────────────── Commit (écriture réelle) ───────────────────────────

  /** Construit la charge utile membre à partir des cellules NON VIDES (→ « garder l'existant »). */
  private buildPayload(row: Record<string, string>): Record<string, unknown> {
    const set: Record<string, unknown> = {};
    const put = (key: string, val: unknown) => {
      if (val !== undefined && val !== null && val !== '') set[key] = val;
    };

    put('matricule', (row['Matricule'] ?? '').trim());
    put('lastname', (row['Nom'] ?? '').trim());
    put('firstname', (row['Prénom'] ?? '').trim());
    const g = norm(row['Genre']);
    if (g === 'HOMME' || g === 'FEMME') set.gender = g.toLowerCase();
    put('birth_date', parseDateFr(row['Date de naissance']));
    put('birth_city', (row['Lieu de naissance'] ?? '').trim());
    put('civility_uuid', this.ref.resolveCivility(row['Civilité']));
    put('marital_status_uuid', this.ref.resolveMarital(row['Situation matrimoniale']));
    put('spouse_name', (row['Nom du conjoint'] ?? '').trim());
    if ((row['Membre de la famille'] ?? '').trim() !== '') {
      set.spouse_member = parseBool(row['Membre de la famille']);
    }
    const nb = (row["Nombre d'enfants"] ?? '').trim();
    if (nb !== '' && !Number.isNaN(Number(nb))) set.childrens = parseInt(nb, 10);
    put('country_uuid', this.ref.resolveCountry(row['Pays']));
    put('city_uuid', this.ref.resolveCity(row['Ville']));
    put('formation_uuid', this.ref.resolveFormation(row['Formation']));
    put('job_uuid', this.ref.resolveJob(row['Profession']));
    put('phone', digitsOnly(row['Téléphone']));
    put('phone_whatsapp', digitsOnly(row['WhatsApp']));
    put('tutor_name', (row['Nom du tuteur'] ?? '').trim());
    put('tutor_phone', digitsOnly(row['Téléphone du tuteur']));
    put('organisation_city_uuid', this.ref.resolveOrganisationCity(row["Ville de l'organisation"]));
    put('email', (row['Email'] ?? '').trim().toLowerCase());
    put('department_uuid', this.ref.resolveDepartment(row['Département']));
    put('division_uuid', this.ref.resolveDivision(row['Division']));
    if ((row['Gohonzon'] ?? '').trim() !== '') set.has_gohonzon = parseBool(row['Gohonzon']);
    put('membership_date', parseDateFr(row['Date adhésion']));
    if ((row['Sokahan Byakuren'] ?? '').trim() !== '') {
      set.sokahan_byakuren = parseBool(row['Sokahan Byakuren']);
    }
    if ((row['Tokusso'] ?? '').trim() !== '') set.has_tokusso = parseBool(row['Tokusso']);
    put('date_tokusso', parseDateFr(row['Date Tokusso']));
    if ((row['Omamori'] ?? '').trim() !== '') set.has_omamori = parseBool(row['Omamori']);
    put('date_omamori', parseDateFr(row['Date Omamori']));
    put('longitude', (row['Longitude'] ?? '').trim());
    put('latitude', (row['Latitude'] ?? '').trim());
    const st = this.ref.resolveStructure(row);
    if (st.uuid) set.structure_uuid = st.uuid;

    return set;
  }

  /** Clé de dédoublonnage des échecs : matricule, sinon `tel:<num>`, sinon `nom:<...>`. */
  private dedupKey(row: Record<string, string>): string {
    const m = (row['Matricule'] ?? '').trim();
    if (m) return m.slice(0, 191);
    const p = digitsOnly(row['Téléphone']);
    if (p) return `tel:${p}`.slice(0, 191);
    return `nom:${norm(`${row['Nom'] ?? ''} ${row['Prénom'] ?? ''}`)}`.slice(0, 191);
  }

  private async recordFailure(
    dedupKey: string,
    outcome: RowOutcome,
    adminUuid: string,
    batchUuid: string,
  ): Promise<void> {
    let f = await this.failureRepo.findOne({ where: { dedup_key: dedupKey } });
    if (!f) f = this.failureRepo.create({ dedup_key: dedupKey });
    f.batch_uuid = batchUuid; // rattache l'échec au dernier fichier qui l'a signalé
    f.line_number = outcome.line;
    f.fullname = (outcome.fullname || '').slice(0, 191) || null;
    f.reason = outcome.reasons.join(' | ');
    f.raw_data = outcome.raw;
    f.admin_uuid = adminUuid;
    await this.failureRepo.save(f);
  }

  private async clearFailure(dedupKey: string): Promise<void> {
    await this.failureRepo.delete({ dedup_key: dedupKey });
  }

  /** Lie une responsabilité (si présente ET résolue ; jamais créée si inexistante). */
  private async linkResponsibility(
    memberUuid: string,
    row: Record<string, string>,
    adminUuid: string,
  ): Promise<void> {
    const val = (row['Responsabilités'] ?? '').trim();
    if (!val) return;
    const respUuid = this.ref.resolveResponsibility(val);
    if (!respUuid) return; // référentiel absent → ignorée
    const exists = await this.memberRespRepo.findOne({
      where: { member_uuid: memberUuid, responsibility_uuid: respUuid },
    });
    if (exists) return;
    await this.memberRespRepo.save(
      this.memberRespRepo.create({
        member_uuid: memberUuid,
        responsibility_uuid: respUuid,
        priority: 'high',
        admin_uuid: adminUuid,
      }),
    );
  }

  /**
   * Commit : écrit réellement en base (création/mise à jour) + persiste les échecs.
   * Pas de transaction globale → commit partiel (les réussites sont conservées,
   * seules les lignes en échec sont reportées dans `import_failures`).
   */
  async commit(buffer: Buffer, adminUuid: string, fileName?: string): Promise<CommitResult> {
    const { rows } = this.parseAndValidate(buffer);
    await this.ref.load();

    // Un « fichier chargé » = ce commit. Créé d'emblée pour pouvoir estampiller les échecs
    // (import_failures.batch_uuid) au fil de la boucle ; les compteurs sont figés à la fin.
    const batch = await this.batchRepo.save(
      this.batchRepo.create({
        file_name: (fileName || '').slice(0, 255) || null,
        admin_uuid: adminUuid,
        total_rows: rows.length,
      }),
    );

    let created = 0;
    let updated = 0;
    let failed = 0;
    let accountsCreated = 0;
    let accountsUpdated = 0;
    const accountsSkipped: { line: number; reason: string }[] = [];
    const outcomes: RowOutcome[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const dedup = this.dedupKey(row);
      const ev = this.safeEvaluateRow(row, i);

      if (ev.status === 'fail') {
        failed++;
        await this.recordFailure(dedup, ev, adminUuid, batch.uuid);
        outcomes.push(ev);
        continue;
      }

      try {
        const payload = this.buildPayload(row);
        let memberUuid: string;

        if (ev.status === 'create') {
          payload.admin_uuid = adminUuid;
          const entity = this.memberRepo.create();
          Object.assign(entity, payload);

          // Membre + compte de connexion dans UNE transaction, comme `MemberService.store()`.
          // Jusqu'au 2026-08-01 l'import n'écrivait que le membre : les lignes importées
          // naissaient sans compte, donc sans moyen de se connecter, et rien ne le signalait
          // (360 membres dans ce cas au 2026-07-30, rattrapés par un seed manuel).
          const saved = await this.memberRepo.manager.transaction(async (manager) => {
            const savedMember = await manager.save(entity);
            const outcome = await this.accounts.reconcileAccount(savedMember, manager);
            if (outcome === 'created') accountsCreated++;
            else accountsSkipped.push({ line: ev.line, reason: outcome });
            return savedMember;
          });

          memberUuid = saved.uuid;
          created++;
        } else {
          memberUuid = this.ref.matchMember(ev.matricule, ev.phone) as string;
          await this.memberRepo.update({ uuid: memberUuid }, payload as never);

          // Le téléphone est l'identifiant de connexion : une fiche corrigée par l'import
          // doit réaligner le compte, sinon le membre continue de se connecter avec l'ancien
          // numéro (origine des 29 écarts compte/fiche relevés le 2026-07-30). Relecture en
          // base plutôt que réutilisation de `payload` : ce dernier omet les colonnes vides,
          // il ne dit donc pas ce que vaut la fiche après écriture.
          // Un membre existant SANS compte en reçoit un ici - c'est ce qui referme l'écart
          // historique au fil des ré-imports, sans seed de rattrapage.
          const fresh = await this.memberRepo.findOne({ where: { uuid: memberUuid } });
          if (fresh) {
            const outcome = await this.accounts.reconcileAccount(fresh);
            if (outcome === 'created') accountsCreated++;
            else if (outcome === 'updated') accountsUpdated++;
            else if (outcome !== 'unchanged') {
              accountsSkipped.push({ line: ev.line, reason: outcome });
            }
          }

          updated++;
        }

        // Post-écriture « best-effort » : ne doit jamais faire échouer la ligne déjà écrite.
        try {
          await this.linkResponsibility(memberUuid, row, adminUuid);
        } catch {
          /* ignore */
        }
        try {
          await this.clearFailure(dedup);
        } catch {
          /* ignore */
        }

        outcomes.push(ev);
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        const failOutcome: RowOutcome = { ...ev, status: 'fail', reasons: [`Erreur d'écriture : ${msg}`] };
        await this.recordFailure(dedup, failOutcome, adminUuid, batch.uuid);
        outcomes.push(failOutcome);
      }
    }

    // Compteurs figés (instantané du commit). Le batch est conservé même sans échec (historique) ;
    // la page Échecs ne liste que les fichiers ayant encore ≥1 erreur en suspens.
    batch.created_count = created;
    batch.updated_count = updated;
    batch.failed_count = failed;
    await this.batchRepo.save(batch);

    return {
      total: rows.length,
      created,
      updated,
      failed,
      total_en_base: this.ref.totalMembersInDb + created,
      rows: outcomes,
      batch_uuid: batch.uuid,
      accounts_created: accountsCreated,
      accounts_updated: accountsUpdated,
      accounts_skipped: accountsSkipped,
    };
  }

  // ─────────────────────────── Stats / échecs persistés ───────────────────────────

  async stats(): Promise<{ total_en_base: number; total_failures: number }> {
    const [total_en_base, total_failures] = await Promise.all([
      this.memberRepo.count(),
      this.failureRepo.count(),
    ]);
    return { total_en_base, total_failures };
  }

  /** Where-clause d'un filtre `batch` : vide = tout, NO_BATCH = sans fichier, sinon par uuid. */
  private failureWhere(batch?: string): FindOptionsWhere<ImportFailureEntity> {
    if (!batch) return {};
    if (batch === NO_BATCH) return { batch_uuid: IsNull() };
    return { batch_uuid: batch };
  }

  async listFailures(page: number, limit: number, batch?: string) {
    const safePage = Math.max(1, page || 1);
    const safeLimit = Math.min(100, Math.max(1, limit || 10));
    const [items, total] = await this.failureRepo.findAndCount({
      where: this.failureWhere(batch),
      order: batch ? { line_number: 'ASC' } : { updated_at: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    return {
      items,
      pagination: {
        total_items: total,
        total_pages: Math.ceil(total / safeLimit) || 1,
        current_page: safePage,
        per_page: safeLimit,
      },
    };
  }

  /**
   * Liste les « fichiers chargés » ayant encore au moins une erreur en suspens, avec le nombre
   * d'erreurs COURANT (recompté en direct depuis import_failures). Les échecs sans fichier
   * (batch_uuid NULL, antérieurs au suivi) forment un pseudo-groupe `NO_BATCH` en fin de liste.
   */
  async listBatches(page: number, limit: number) {
    const safePage = Math.max(1, page || 1);
    const safeLimit = Math.min(100, Math.max(1, limit || 10));

    // 1 ligne par batch_uuid distinct (NULL inclus) = nb d'échecs encore rattachés.
    const grouped = await this.failureRepo
      .createQueryBuilder('f')
      .select('f.batch_uuid', 'batch_uuid')
      .addSelect('COUNT(f.id)', 'cnt')
      .groupBy('f.batch_uuid')
      .getRawMany<{ batch_uuid: string | null; cnt: string }>();

    const nonNull = grouped.filter((g) => g.batch_uuid);
    const nullGroup = grouped.find((g) => !g.batch_uuid);

    const uuids = nonNull.map((g) => g.batch_uuid as string);
    const batches = uuids.length
      ? await this.batchRepo.find({ where: { uuid: In(uuids) } })
      : [];
    const byUuid = new Map(batches.map((b) => [b.uuid, b]));

    const items = nonNull.map((g) => {
      const b = byUuid.get(g.batch_uuid as string);
      return {
        uuid: g.batch_uuid as string,
        file_name: b?.file_name ?? null,
        created_at: b?.created_at ?? null,
        total_rows: b?.total_rows ?? null,
        created_count: b?.created_count ?? null,
        updated_count: b?.updated_count ?? null,
        failed_count: b?.failed_count ?? null,
        outstanding: Number(g.cnt),
      };
    });

    // Plus récent d'abord ; un batch sans métadonnée (cas limite) passe en dernier.
    items.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    // Pseudo-groupe « sans fichier » en toute fin.
    if (nullGroup && Number(nullGroup.cnt) > 0) {
      items.push({
        uuid: NO_BATCH,
        file_name: null,
        created_at: null,
        total_rows: null,
        created_count: null,
        updated_count: null,
        failed_count: null,
        outstanding: Number(nullGroup.cnt),
      });
    }

    const total = items.length;
    const start = (safePage - 1) * safeLimit;
    return {
      items: items.slice(start, start + safeLimit),
      pagination: {
        total_items: total,
        total_pages: Math.ceil(total / safeLimit) || 1,
        current_page: safePage,
        per_page: safeLimit,
      },
    };
  }

  /**
   * Construit un classeur Excel (.xlsx, feuille « Membres ») des échecs d'un fichier donné,
   * RÉ-IMPORTABLE : les 51 colonnes canoniques reconstituées depuis `raw_data`, dans l'ordre,
   * suivies de 2 colonnes d'aide « Motifs d'échec » et « N° ligne » (ignorées au réimport,
   * car le parseur ne lit que les 51 premières colonnes).
   */
  async exportFailuresXlsx(batch?: string): Promise<{ buffer: Buffer; filename: string }> {
    const failures = await this.failureRepo.find({
      where: this.failureWhere(batch),
      order: { line_number: 'ASC' },
    });

    const header = [...CANON, "Motifs d'échec", 'N° ligne'];
    const aoa: (string | number)[][] = [header];
    for (const f of failures) {
      const raw = (f.raw_data || {}) as Record<string, string>;
      const line: (string | number)[] = CANON.map((c) => raw[c] ?? '');
      line.push((f.reason || '').split(' | ').join(' ; '));
      line.push(f.line_number != null ? f.line_number + 1 : '');
      aoa.push(line);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Membres');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    // Nom de fichier dérivé du fichier d'origine, normalisé ASCII pour l'en-tête HTTP.
    let base = 'erreurs_import';
    if (batch && batch !== NO_BATCH) {
      const b = await this.batchRepo.findOne({ where: { uuid: batch } });
      if (b?.file_name) base = b.file_name.replace(/\.(xlsx|xls)$/i, '');
    } else if (batch === NO_BATCH) {
      base = 'erreurs_anterieures';
    }
    // NFD décompose les accents (é → e + diacritique) ; le strip non-ASCII qui suit retire
    // les diacritiques ET tout autre caractère hors en-tête HTTP simple.
    const safe =
      base
        .normalize('NFD')
        .replace(/[^A-Za-z0-9-_ ]+/g, '')
        .trim() || 'erreurs_import';
    return { buffer, filename: `${safe}_erreurs.xlsx` };
  }
}
