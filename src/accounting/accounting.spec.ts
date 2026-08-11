import { AccountingService } from './accounting.service';
import { MatchStatus } from './entities/acc-hub-snapshot-line.entity';
import { SnapshotKind } from './entities/acc-hub-snapshot.entity';
import { parseHub2Export, recomposerDate } from './hub2-export.parser';
import * as XLSX from 'xlsx';

/**
 * Concordance « Solde HUB2 = Solde App ».
 *
 * Ces tests verrouillent les règles qui ne se devinent pas à la lecture : la clé de
 * rapprochement (celle de l'export n'est PAS celle que l'application stocke), la priorité du
 * désaccord de statut sur celui de montant, la présence du solde d'ouverture dans le décompte,
 * et l'interdiction absolue d'écrire dans `payments`.
 */

function feuilleExport(lignes: Record<string, unknown>[]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Export');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function makeService(options: {
  appCount?: number;
  appGross?: number;
  gatewayPayments?: any[];
  appPayments?: any[];
  dernierSnapshot?: any;
} = {}) {
  const lignesEcrites: any[] = [];
  const snapshotsEcrits: any[] = [];

  const snapshotRepo = {
    create: jest.fn((o) => ({ ...o, uuid: 'snap-uuid', created_at: new Date('2026-08-10T22:00:00Z') })),
    save: jest.fn((o) => { snapshotsEcrits.push(o); return Promise.resolve(o); }),
    findOne: jest.fn().mockResolvedValue(options.dernierSnapshot ?? null),
    find: jest.fn().mockResolvedValue([]),
  };
  const lineRepo = {
    create: jest.fn((o) => o),
    save: jest.fn((o) => { lignesEcrites.push(...(Array.isArray(o) ? o : [o])); return Promise.resolve(o); }),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  };

  const paymentQb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({
      count: String(options.appCount ?? 0),
      gross: String(options.appGross ?? 0),
    }),
    getMany: jest.fn().mockResolvedValue(options.appPayments ?? []),
  };
  const paymentRepo = { createQueryBuilder: jest.fn().mockReturnValue(paymentQb) };

  const hubService = {
    listGatewayPayments: jest.fn().mockResolvedValue({
      payments: options.gatewayPayments ?? [],
      total: (options.gatewayPayments ?? []).length,
      complet: true,
    }),
  };

  const service = new AccountingService(
    snapshotRepo as never,
    lineRepo as never,
    paymentRepo as never,
    hubService as never,
  );

  return { service, snapshotRepo, lineRepo, paymentRepo, hubService, lignesEcrites, snapshotsEcrits };
}

describe('Concordance - lecture de l\'export HUB2', () => {
  it('recompose la date UTC à partir des deux colonnes, suffixe Z compris', () => {
    // L'export sépare date et heure, l'heure portant déjà le `Z`. Recoller sans lui ferait
    // interpréter l'heure en local et décalerait tout l'export d'un fuseau - assez pour faire
    // basculer des transactions d'un jour à l'autre.
    const d = recomposerDate('2026-07-22', '22:43:15.455Z');
    expect(d?.toISOString()).toBe('2026-07-22T22:43:15.455Z');
  });

  it('ajoute le Z quand il manque plutôt que d\'interpréter en heure locale', () => {
    expect(recomposerDate('2026-07-22', '10:00:00')?.toISOString()).toBe('2026-07-22T10:00:00.000Z');
  });

  it('rend null sur une date illisible au lieu d\'une Invalid Date', () => {
    expect(recomposerDate('pas-une-date', '10:00:00Z')).toBeNull();
    expect(recomposerDate('', '')).toBeNull();
  });

  it('lit les colonnes de l\'export, quelles que soient leur casse et leur ordre', () => {
    const buffer = feuilleExport([
      {
        status: 'successful', PaymentID: 'pay_A', amount: 15000, fees: 300,
        provider: 'WAVE', msisdn: '0700000000', purchaseReference: 'SOKA_ACHAT_x',
        createdAtDate: '2026-08-02', createdAtTime: '12:34:56.000Z', colonneEnPlus: 'ignorée',
      },
    ]);
    const { lignes } = parseHub2Export(buffer);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].paymentId).toBe('pay_A');
    expect(lignes[0].amount).toBe(15000);
    expect(lignes[0].fees).toBe(300);
    expect(lignes[0].provider).toBe('wave');
    expect(lignes[0].createdAt?.toISOString()).toBe('2026-08-02T12:34:56.000Z');
  });

  it('écarte - en les comptant - les lignes sans identifiant, plutôt que de les inventer', () => {
    const buffer = feuilleExport([
      { paymentId: 'pay_A', amount: 100, status: 'successful' },
      { paymentId: '', amount: 200, status: 'successful' },
    ]);
    const { lignes, ignorees } = parseHub2Export(buffer);
    expect(lignes).toHaveLength(1);
    expect(ignorees).toEqual([2]);
  });
});

describe('Concordance - appariement', () => {
  const paiementPaye = { uuid: 'p1', transaction_id: 'plink_1', total_amount: 15000, payment_status: 'paid' };

  it('apparie par linkId et confirme l\'égalité quand tout concorde', async () => {
    const { service, snapshotsEcrits, lignesEcrites } = makeService({
      appCount: 1,
      appGross: 15000,
      appPayments: [paiementPaye],
      gatewayPayments: [{
        id: 'pay_guichet_28c', linkId: 'plink_1', status: 'successful', amount: 15000,
        currency: 'XOF', hub2PaymentId: 'pay_hub2_25c', createdAt: '2026-08-02T12:00:00.000Z',
        updatedAt: '2026-08-02T12:01:00.000Z',
      }],
    });

    await service.refreshFromGateway();

    expect(snapshotsEcrits[0].matched_count).toBe(1);
    expect(snapshotsEcrits[0].gap_gross).toBe('0');
    // 🚨 C'est l'identifiant HUB2 qui est conservé, jamais celui du guichet : seul le premier
    // figure dans l'export HUB2 (1 383 des 1 400 lignes s'apparient par lui, 0 par l'autre).
    expect(lignesEcrites[0].hub_payment_id).toBe('pay_hub2_25c');
  });

  it('classe en `unmatched_hub` une transaction que l\'application ignore', async () => {
    const { service, snapshotsEcrits } = makeService({
      appCount: 0, appGross: 0, appPayments: [],
      gatewayPayments: [{
        id: 'pay_x', linkId: 'plink_inconnu', status: 'successful', amount: 15000,
        currency: 'XOF', hub2PaymentId: 'pay_h', createdAt: '2026-08-02T12:00:00.000Z',
        updatedAt: '2026-08-02T12:00:00.000Z',
      }],
    });

    await service.refreshFromGateway();
    expect(snapshotsEcrits[0].unmatched_hub_count).toBe(1);
    expect(snapshotsEcrits[0].gap_gross).toBe('15000');
  });

  it('🚨 le désaccord de STATUT prime sur celui de montant', async () => {
    // Une transaction encaissée au guichet et non créditée est un problème d'ARGENT ; un écart
    // de montant entre deux lignes d'accord sur l'encaissement est un problème de saisie. Les
    // confondre noierait le premier dans le second.
    const { service, snapshotsEcrits, lignesEcrites } = makeService({
      appCount: 0,
      appGross: 0,
      appPayments: [{ ...paiementPaye, payment_status: 'pending', total_amount: 9999 }],
      gatewayPayments: [{
        id: 'pay_x', linkId: 'plink_1', status: 'successful', amount: 15000, currency: 'XOF',
        hub2PaymentId: 'pay_h', createdAt: '2026-08-02T12:00:00.000Z', updatedAt: '2026-08-02T12:00:00.000Z',
      }],
    });

    await service.refreshFromGateway();
    expect(lignesEcrites[0].match_status).toBe(MatchStatus.STATUS_MISMATCH);
    expect(snapshotsEcrits[0].mismatch_count).toBe(1);
  });

  it('🚨 un RÉESSAI n\'est pas une divergence', async () => {
    // Le guichet liste toutes les tentatives d'un lien, l'application n'en a qu'une ligne. Un
    // lien payé au 2ᵉ essai met donc une tentative `failed` en face d'un paiement `paid`.
    // Constaté sur les données réelles avant correctif : 19 fausses divergences, 285 000 XOF -
    // de quoi faire croire à une fuite d'argent là où il n'y en a aucune.
    const { service, snapshotsEcrits, lignesEcrites } = makeService({
      appCount: 1,
      appGross: 15000,
      appPayments: [paiementPaye],
      gatewayPayments: [
        { id: 'pay_1', linkId: 'plink_1', status: 'failed', amount: 15000, currency: 'XOF',
          hub2PaymentId: 'pay_h1', createdAt: '2026-08-02T12:00:00.000Z', updatedAt: '2026-08-02T12:00:00.000Z' },
        { id: 'pay_2', linkId: 'plink_1', status: 'successful', amount: 15000, currency: 'XOF',
          hub2PaymentId: 'pay_h2', createdAt: '2026-08-02T12:05:00.000Z', updatedAt: '2026-08-02T12:05:00.000Z' },
      ],
    });

    await service.refreshFromGateway();

    expect(lignesEcrites.map((l) => l.match_status)).toEqual([
      MatchStatus.MATCHED, MatchStatus.MATCHED,
    ]);
    expect(snapshotsEcrits[0].mismatch_count).toBe(0);
  });

  it('🚨 mais un paiement crédité SANS aucune réussite au guichet reste une divergence', async () => {
    // Le cas fautif que la règle du réessai ne doit surtout pas absorber : l'argent est en jeu.
    const { service, lignesEcrites } = makeService({
      appCount: 1,
      appGross: 15000,
      appPayments: [paiementPaye],
      gatewayPayments: [
        { id: 'pay_1', linkId: 'plink_1', status: 'failed', amount: 15000, currency: 'XOF',
          hub2PaymentId: 'pay_h1', createdAt: '2026-08-02T12:00:00.000Z', updatedAt: '2026-08-02T12:00:00.000Z' },
      ],
    });

    await service.refreshFromGateway();
    expect(lignesEcrites[0].match_status).toBe(MatchStatus.STATUS_MISMATCH);
  });

  it('signale une lecture tronquée au lieu d\'annoncer un écart imaginaire', async () => {
    const { service, snapshotsEcrits, hubService } = makeService();
    hubService.listGatewayPayments.mockResolvedValue({ payments: [], total: 500, complet: false });

    await service.refreshFromGateway();
    expect(snapshotsEcrits[0].truncated).toBe(true);
    expect(snapshotsEcrits[0].label).toContain('TRONQUÉE');
  });
});

describe('Concordance - le décompte affiché', () => {
  it('🚨 fait apparaître le solde d\'ouverture comme une LIGNE du décompte', async () => {
    // Le rapprochement du 09/08 ne s'est fermé qu'avec les 196 XOF d'ouverture. Enfouis dans une
    // formule, ils produiraient un écart permanent sans catégorie et « 0 ligne inexpliquée »
    // deviendrait inatteignable.
    const { service } = makeService({
      appCount: 775,
      appGross: 11570000,
      dernierSnapshot: {
        uuid: 's1', kind: SnapshotKind.GATEWAY, label: 'Guichet', created_at: new Date(),
        truncated: false, hub_success_count: 1043, hub_total_count: 2010,
        opening_balance: '196', hub_gross: '11600301', hub_fees: '232007', hub_net: '11368294',
        matched_count: 775, unmatched_hub_count: 268, unmatched_app_count: 0, mismatch_count: 0,
      },
    });

    const vue = await service.overview();

    expect(vue.gateway?.decompte).toEqual({
      solde_ouverture: 196,
      encaissements: 11600301,
      frais: -232007,
      solde_attendu: 11368490,
    });
    // L'écart constaté sur les données réelles : les 268 paiements d'essai supprimés de la base.
    expect(vue.equality.gap_gross).toBe(30301);
    expect(vue.equality.gross_ok).toBe(false);
    expect(vue.app.fees_theoretical).toBe(231400);
  });

  it('🚨 compare à PÉRIMÈTRE ÉGAL : la période de l\'instantané borne le côté application', async () => {
    // Un export HUB2 couvre l'intervalle demandé à HUB2, pas toute la vie du service. Constaté
    // en éprouvant le vrai export de 1 400 lignes : 6 725 701 XOF confrontés au total complet de
    // l'application (11 600 101) affichaient un écart imaginaire de 4,9 MILLIONS. La période de
    // l'instantané de référence doit donc borner l'agrégat applicatif.
    const { service, paymentRepo } = makeService({
      appCount: 742,
      appGross: 6725001,
      dernierSnapshot: {
        uuid: 's1', kind: SnapshotKind.EXPORT, label: 'Export', created_at: new Date(),
        truncated: false, hub_success_count: 748, hub_total_count: 1400,
        opening_balance: '196', hub_gross: '6725701', hub_fees: '134515', hub_net: '6591186',
        period_start: new Date('2026-07-22T22:43:15Z'),
        period_end: new Date('2026-08-07T14:51:08Z'),
        matched_count: 1121, unmatched_hub_count: 279, unmatched_app_count: 0, mismatch_count: 0,
      },
    });

    const vue = await service.overview();
    const qb = (paymentRepo.createQueryBuilder as jest.Mock).mock.results[0].value;

    // Le périmètre a bien été appliqué à la requête, et il est ANNONCÉ dans la réponse : une
    // égalité sans son périmètre n'est pas une information.
    expect(qb.andWhere).toHaveBeenCalledWith('p.created_at >= :from', expect.anything());
    expect(qb.andWhere).toHaveBeenCalledWith('p.created_at <= :to', expect.anything());
    expect(vue.perimetre_compare.herite_de_instantane).toBe(true);
    expect(vue.equality.gap_gross).toBe(700);
  });

  it('🚨 un export ANCIEN ne masque pas une lecture du guichet plus récente', async () => {
    // L'export porte les frais réels, ce qui justifie sa préséance - mais pas au point de faire
    // afficher 6,7 M (export arrêté au 07/08) là où le guichet du jour en porte 11,6. Un
    // utilisateur qui connaît le solde de son compte conclut alors que l'écran ment.
    const guichetRecent = {
      uuid: 'g1', kind: SnapshotKind.GATEWAY, label: 'Guichet', created_at: new Date('2026-08-11T00:13:00Z'),
      truncated: false, hub_success_count: 1043, hub_total_count: 1997,
      opening_balance: '196', hub_gross: '11600301', hub_fees: '232006.02', hub_net: '11368294.98',
      period_start: null, period_end: null,
      matched_count: 1735, unmatched_hub_count: 262, unmatched_app_count: 0, mismatch_count: 0,
    };
    const exportAncien = {
      ...guichetRecent, uuid: 'e1', kind: SnapshotKind.EXPORT, label: 'Export',
      created_at: new Date('2026-08-11T00:06:00Z'), hub_gross: '6725701', hub_net: '6591186',
    };

    const { service, snapshotRepo } = makeService({ appCount: 1041, appGross: 11600101 });
    (snapshotRepo.findOne as jest.Mock).mockImplementation(({ where }: any) =>
      Promise.resolve(where.kind === SnapshotKind.GATEWAY ? guichetRecent : exportAncien),
    );

    const vue = await service.overview();

    expect(vue.reference_source).toBe('gateway');
    expect(vue.reference_motif).toContain('plus récente');
    expect(vue.equality.gap_gross).toBe(200);
  });

  it('n\'affirme aucune égalité tant qu\'aucun instantané n\'existe', async () => {
    const { service } = makeService({ appCount: 10, appGross: 150000 });
    const vue = await service.overview();

    expect(vue.equality.evaluated).toBe(false);
    expect(vue.equality.gap_gross).toBeNull();
    expect(vue.reference_source).toBeNull();
  });
});

describe('Concordance - garde-fou d\'architecture', () => {
  it('🚨 n\'écrit JAMAIS dans `payments`', async () => {
    // Le module est en lecture seule sur l'argent. Une seconde route vers les statuts finirait
    // par diverger de `syncHubPaymentByTransactionId` - la cause exacte des écarts de début août.
    const { service, paymentRepo } = makeService({
      appCount: 1,
      appGross: 15000,
      appPayments: [{ uuid: 'p1', transaction_id: 'plink_1', total_amount: 15000, payment_status: 'paid' }],
      gatewayPayments: [{
        id: 'pay_x', linkId: 'plink_1', status: 'successful', amount: 15000, currency: 'XOF',
        hub2PaymentId: 'pay_h', createdAt: '2026-08-02T12:00:00.000Z', updatedAt: '2026-08-02T12:00:00.000Z',
      }],
    });

    await service.refreshFromGateway();
    await service.overview();

    // Le simulacre n'expose délibérément ni `save`, ni `update`, ni `delete` : si le service
    // tentait d'écrire, il lèverait au lieu de passer inaperçu.
    expect((paymentRepo as any).save).toBeUndefined();
    expect((paymentRepo as any).update).toBeUndefined();
  });
});
