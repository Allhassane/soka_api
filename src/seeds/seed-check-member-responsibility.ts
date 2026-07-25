import 'reflect-metadata';
import AppDataSource from '../data-source';
import { MemberEntity } from '../members/entities/member.entity';

/**
 * AUDIT — Un membre est-il responsable ou simple membre ? (LECTURE SEULE)
 *
 * Recherche un membre par TÉLÉPHONE (ou MATRICULE) et affiche ses
 * responsabilités (member_responsibilities). Répond sans ambiguïté à
 * « est-ce un responsable ou un simple membre ? ».
 *
 * Paramétrable :
 *   PHONE=0707865465 npm run seed:check-member
 *   MATRICULE=25-0002 npm run seed:check-member
 * (défaut : PHONE=0707865465 = KOUADIO KOUAKOU ARSENE)
 */

const PHONE = process.env.PHONE || (process.env.MATRICULE ? '' : '0707865465');
const MATRICULE = process.env.MATRICULE || '';

async function run() {
  const ds = await AppDataSource.initialize();
  console.log(`[check] Base cible : ${ds.options.database as string}`);

  try {
    const memberRepo = ds.getRepository(MemberEntity);

    const member = MATRICULE
      ? await memberRepo.findOne({ where: { matricule: MATRICULE } })
      : await memberRepo.findOne({ where: { phone: PHONE } });

    if (!member) {
      console.log(
        `\n>>> Aucun membre trouvé (${MATRICULE ? 'matricule ' + MATRICULE : 'téléphone ' + PHONE}).`,
      );
      return;
    }

    const nom = `${(member as unknown as { lastname?: string }).lastname ?? ''} ${(member as unknown as { firstname?: string }).firstname ?? ''}`.trim();
    const su = (member as unknown as { structure_uuid?: string | null }).structure_uuid ?? null;

    console.log('\n========== VÉRIFICATION MEMBRE ==========');
    console.log(`Nom          : ${nom}`);
    console.log(`Matricule    : ${(member as unknown as { matricule?: string }).matricule ?? '—'}`);
    console.log(`Téléphone    : ${(member as unknown as { phone?: string }).phone ?? '—'}`);
    console.log(`member_uuid  : ${member.uuid}`);
    console.log(`structure_uuid: ${su ?? '—'}`);

    // Structure du membre (nom + niveau) — ce que le header affiche en repli.
    if (su) {
      const s = await ds.query(
        `SELECT s.name AS structure_name, l.name AS level_name
         FROM structures s LEFT JOIN levels l ON l.uuid = s.level_uuid
         WHERE s.uuid = ? LIMIT 1`,
        [su],
      );
      if (s.length) {
        console.log(`Structure    : ${s[0].structure_name} (niveau ${s[0].level_name ?? '—'})`);
      }
    }

    // Responsabilités réelles.
    const resp = await ds.query(
      `SELECT r.name AS responsibility, l.name AS level, r.level_uuid AS level_uuid
       FROM member_responsibilities mr
       JOIN responsibilities r ON r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL
       LEFT JOIN levels l ON l.uuid = r.level_uuid
       WHERE mr.member_uuid = ? AND mr.deleted_at IS NULL`,
      [member.uuid],
    );

    console.log('------------------------------------------');
    if (!resp.length) {
      console.log('VERDICT : SIMPLE MEMBRE — aucune responsabilité en base.');
      console.log('(Le header devrait donc afficher « Membre », pas « RESPONSABLE ».)');
    } else {
      console.log(`VERDICT : RESPONSABLE — ${resp.length} responsabilité(s) :`);
      for (const x of resp) {
        console.log(`   • ${x.responsibility}  | niveau ${x.level ?? '(inconnu)'}`);
      }
    }
    console.log('------------------------------------------');
    console.log('[check] (lecture seule — aucune écriture en base)');
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((e) => {
  console.error('[check] Échec :', e);
  process.exit(1);
});
