import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { MemberEntity } from './entities/member.entity';

/**
 * **Point unique de génération du matricule d'un membre.**
 *
 * Même histoire que `MemberAccountService` : la règle vivait dans `MemberService.store()`, et
 * l'**import Excel ne la rejouait pas**. `ImportService.buildPayload()` recopiait la cellule
 * « Matricule » verbatim, en ignorant les cellules vides. Résultat constaté le 2026-09-08 sur
 * les 271 membres créés par l'import : **235 sans aucun matricule**, 31 portant le contenu brut
 * du tableur (`sss`, `XXXXX`, les numéros de ligne `1`..`18`, « Nouveau membre ou non
 * digitalisé »), et **4** au format attendu. Rien dans l'interface ne le signalait.
 *
 * ⚠️ **Ne pas réimplémenter la règle chez l'appelant.** Toute voie qui crée un membre passe par
 * `generate()` : deux copies divergeraient, et la divergence est invisible jusqu'à ce qu'un
 * écran cherche à afficher le matricule.
 */
@Injectable()
export class MatriculeService {
  constructor(
    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,
  ) {}

  /**
   * Format canonique : `AA-NNNN` — deux chiffres d'année, puis le rang du membre.
   *
   * ⚠️ Le rembourrage est un **minimum**, pas une largeur fixe. `padStart(4)` d'origine cassait
   * le format au 10 000ᵉ membre (`26-10000` sur 5 chiffres) : la base en comptait déjà 8 270 le
   * 2026-09-08, soit ~1 700 créations d'avance. Élargir est sans effet sur les matricules
   * existants — un numéro à 4 chiffres reste écrit sur 4.
   */
  static format(year: number, rank: number): string {
    const yearSuffix = year.toString().slice(-2);
    return `${yearSuffix}-${String(rank).padStart(4, '0')}`;
  }

  /**
   * Une valeur fournie de l'extérieur (colonne « Matricule » d'un import) est-elle un matricule
   * plausible, ou du remplissage de tableur ?
   *
   * Acceptés : le format canonique `AA-NNNN`, et la numérotation héritée de l'ancien système
   * (tout-chiffres, ≥ 4 positions, ex. `0007283`) — **24 fiches en base en portent une, ce sont
   * de vrais identifiants** qu'on ne doit pas écraser.
   *
   * Refusés : le texte libre et les nombres courts, qui sont en pratique des **numéros de ligne**
   * du tableur (`1`..`18` relevés en base). Les prendre pour des matricules crée des collisions
   * immédiates entre deux fichiers importés.
   */
  static isPlausible(value: string | null | undefined): boolean {
    const v = (value ?? '').trim();
    if (v === '') return false;
    return /^\d{2}-\d{4,}$/.test(v) || /^\d{4,}$/.test(v);
  }

  /**
   * Prochain matricule libre.
   *
   * ⚠️ `withDeleted()` est INDISPENSABLE : sans lui, TypeORM ajoute `deleted_at IS NULL`, donc
   * supprimer (logiquement) le dernier membre créé fait retomber le rang sur l'avant-dernier et
   * le membre suivant **régénère le matricule du supprimé**. Une ligne soft-deletée occupe
   * toujours son `id`.
   *
   * La boucle de vérification n'est pas décorative : le rang vient de `MAX(id)`, alors que les
   * matricules historiques ne suivent pas les `id` (la numérotation héritée monte jusqu'à 8604
   * pour un `MAX(id)` de 8270). Sans elle, une année future pourrait retomber sur un numéro déjà
   * pris - ce que `UQ_members_matricule` refuserait, faisant échouer la création.
   *
   * @param manager transaction en cours à réutiliser, pour que le rang tienne compte des membres
   *   insérés dans le même commit.
   */
  async generate(manager?: EntityManager): Promise<string> {
    const repo = manager ? manager.getRepository(MemberEntity) : this.memberRepo;

    const lastMember = await repo
      .createQueryBuilder('m')
      .withDeleted()
      .orderBy('m.id', 'DESC')
      .getOne();

    const year = new Date().getFullYear();
    let rank = lastMember ? lastMember.id + 1 : 1;

    // Bornée : au-delà, c'est un défaut de données, pas une collision à contourner.
    for (let i = 0; i < 1000; i++) {
      const candidate = MatriculeService.format(year, rank);
      const taken = await repo
        .createQueryBuilder('m')
        .withDeleted()
        .where('m.matricule = :candidate', { candidate })
        .getCount();
      if (taken === 0) return candidate;
      rank++;
    }

    throw new Error(
      "Impossible de générer un matricule libre après 1000 tentatives : vérifier l'état de `members.matricule`.",
    );
  }
}
