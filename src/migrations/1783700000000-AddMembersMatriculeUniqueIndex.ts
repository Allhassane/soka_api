import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * **`UQ_members_matricule`** - l'unicité du matricule, enfin posée en base (2026-09-08).
 *
 * **Pourquoi elle manquait.** `CreateMemberRegistration` l'avait volontairement sautée : 10 fiches
 * portaient un libellé de formulaire en guise de matricule (« Nouveau membre ou non digitalisé »
 * ×8, « Ancien membre venu d'autre centre » ×2), et un `UNIQUE` aurait fait échouer la migration.
 * L'absence d'index a coûté cher : rien n'a signalé les **235 membres importés sans aucun
 * matricule** entre le 2026-07-27 et le 2026-08-04, ni les 31 qui portaient le remplissage brut du
 * tableur. La cause est corrigée dans le code (`MatriculeService`, partagé par
 * `MemberService.store()` et `ImportService`) ; cet index est le filet.
 *
 * **NULL reste permis, et c'est voulu** : MySQL autorise plusieurs NULL sous un index UNIQUE.
 * L'index garantit qu'aucun matricule n'est porté deux fois, pas qu'il en existe un partout - la
 * seconde garantie appartient au code, qui en génère systématiquement un.
 *
 * ⚠️ **Cette migration REFUSE de s'appliquer sur une base porteuse de doublons**, avec la commande
 * de rattrapage dans le message. C'est délibéré : les deux alternatives sont pires. Créer un index
 * simple à la place livrerait une migration qui **ment sur son nom** (`UQ_…` sans unicité, sur un
 * environnement et pas l'autre). Dédoublonner ici modifierait des données métier **au démarrage de
 * l'API**, sans relecture ni rapport - or l'arbitrage « cette valeur est-elle un identifiant ou une
 * note de saisie ? » ne se prend pas dans une migration. Le seed, lui, produit un Excel de ce
 * qu'il compte faire et se joue en `--dry-run` d'abord.
 *
 * Rattrapage (depuis api/) :
 *   npm run seed:fix-missing-matricule -- --dry-run
 *   npm run seed:fix-missing-matricule -- --liberer-doublons --confirm
 *
 * Idempotente (contrôle d'existence) et réversible.
 */
export class AddMembersMatriculeUniqueIndex1783700000000
  implements MigrationInterface
{
  name = 'AddMembersMatriculeUniqueIndex1783700000000';

  private async aIndex(qr: QueryRunner, index: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'members' AND index_name = ? LIMIT 1`,
      [index],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    if (await this.aIndex(qr, 'UQ_members_matricule')) return;

    // Le `TRIM(COALESCE(...))` reprend exactement la définition de « sans matricule » utilisée par
    // le seed et par les relevés : sans lui, une chaîne vide compterait comme une valeur et deux
    // fiches vides passeraient pour un doublon.
    const doublons: Array<{ matricule: string; n: number }> = await qr.query(
      `SELECT matricule, COUNT(*) AS n
         FROM members
        WHERE TRIM(COALESCE(matricule, '')) <> ''
        GROUP BY matricule
       HAVING COUNT(*) > 1
        ORDER BY n DESC
        LIMIT 10`,
    );

    if (doublons.length > 0) {
      const apercu = doublons
        .map((d) => `« ${d.matricule} » ×${d.n}`)
        .join(', ');
      throw new Error(
        `UQ_members_matricule ne peut pas être posé : des matricules sont portés par plusieurs ` +
          `fiches (${apercu}). Rattraper d'abord avec ` +
          `« npm run seed:fix-missing-matricule -- --liberer-doublons --confirm » ` +
          `(jouer « -- --dry-run » pour voir ce qui serait modifié), puis rejouer cette migration.`,
      );
    }

    await qr.query(
      'CREATE UNIQUE INDEX `UQ_members_matricule` ON `members` (`matricule`)',
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (!(await this.aIndex(qr, 'UQ_members_matricule'))) return;
    await qr.query('DROP INDEX `UQ_members_matricule` ON `members`');
  }
}
