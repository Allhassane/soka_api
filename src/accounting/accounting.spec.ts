import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { AccountingService } from './accounting.service';
import { AccountingWithdrawalsController } from './accounting-withdrawals.controller';
import { MatchStatus } from './entities/acc-hub-snapshot-line.entity';
import { SnapshotKind } from './entities/acc-hub-snapshot.entity';
import { parseHub2Export, recomposerDate } from './hub2-export.parser';
import { appliquerFiltresPaiementsCompta } from '../export-async/accounting-payments-query';
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
  campagnesAbonnements?: any[];
  campagnesDons?: any[];
  /** Retraits du compte de collecte tels que le guichet les relaie depuis HUB2 (aucun par défaut). */
  retraitsHub?: any[];
  /** Le guichet (ou HUB2) ne rend pas les retraits. */
  retraitsIndisponibles?: boolean;
  /** Sous-arbre rendu par `AccessScopeService.sousArbre` (filtre « Structure »). */
  sousArbre?: string[];
  /** Structure sans parent (la racine) ; `null` = aucune. */
  racine?: any;
  /** Le parent demandé à la cascade existe-t-il ? */
  parentExiste?: boolean;
  /** Lignes brutes rendues pour les enfants d'une structure. */
  enfants?: any[];
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
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({
      count: String(options.appCount ?? 0),
      gross: String(options.appGross ?? 0),
    }),
    getRawMany: jest.fn().mockResolvedValue([]),
    getMany: jest.fn().mockResolvedValue(options.appPayments ?? []),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const paymentRepo = { createQueryBuilder: jest.fn().mockReturnValue(paymentQb) };

  // Lecture seule, comme `payments` : ces simulacres n'exposent délibérément aucune écriture.
  const subscriptionRepo = {
    find: jest.fn().mockResolvedValue(options.campagnesAbonnements ?? []),
  };
  const donateRepo = {
    find: jest.fn().mockResolvedValue(options.campagnesDons ?? []),
  };

  const hubService = {
    listGatewayPayments: jest.fn().mockResolvedValue({
      payments: options.gatewayPayments ?? [],
      total: (options.gatewayPayments ?? []).length,
      complet: true,
    }),
    getGatewayBalance: jest.fn().mockResolvedValue({
      environment: 'live',
      collection: [{ currency: 'xof', amount: 100, availableBalance: 100 }],
      transfer: [],
    }),
    listGatewayWithdrawals: options.retraitsIndisponibles
      ? jest.fn().mockRejectedValue(new Error('guichet muet'))
      : jest.fn().mockResolvedValue(options.retraitsHub ?? []),
  };

  // Lecture seule, elle aussi : la cascade du filtre « Structure » ne lit que des noms.
  const structureQb = {
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(options.enfants ?? []),
  };
  const structureRepo = {
    findOne: jest
      .fn()
      .mockResolvedValue(options.racine === undefined ? { uuid: 'national' } : options.racine),
    exists: jest.fn().mockResolvedValue(options.parentExiste ?? true),
    createQueryBuilder: jest.fn().mockReturnValue(structureQb),
  };
  const accessScope = {
    sousArbre: jest.fn().mockResolvedValue(new Set(options.sousArbre ?? [])),
  };

  const service = new AccountingService(
    snapshotRepo as never,
    lineRepo as never,
    paymentRepo as never,
    subscriptionRepo as never,
    donateRepo as never,
    hubService as never,
    structureRepo as never,
    accessScope as never,
  );

  return {
    service, snapshotRepo, lineRepo, paymentRepo, subscriptionRepo, donateRepo,
    hubService, lignesEcrites, snapshotsEcrits, paymentQb,
    structureRepo, structureQb, accessScope,
  };
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
    // Une ligne qui concorde n'est pas conservée : seul son compte figure sur l'en-tête.
    expect(lignesEcrites).toHaveLength(0);
  });

  it('classe en `unmatched_hub` une transaction que l\'application ignore', async () => {
    const { service, snapshotsEcrits, lignesEcrites } = makeService({
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
    // 🚨 C'est l'identifiant HUB2 qui est conservé, jamais celui du guichet : seul le premier
    // figure dans l'export HUB2 (1 383 des 1 400 lignes s'apparient par lui, 0 par l'autre).
    expect(lignesEcrites[0].hub_payment_id).toBe('pay_h');
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

    expect(snapshotsEcrits[0].matched_count).toBe(2);
    expect(snapshotsEcrits[0].mismatch_count).toBe(0);
    expect(lignesEcrites).toHaveLength(0);
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

describe('Concordance - ce que coûte un « Rafraîchir »', () => {
  // Le 26/09, le bouton échouait en production : plus de 30 s (le délai du navigateur) pour relire
  // ET réécrire tout l'historique du guichet - 9 323 tentatives - à chaque clic. Ces tests
  // verrouillent les gestes qui ramènent le clic à quelques secondes.
  const tentative = (id: string, linkId: string, status = 'successful') => ({
    id, linkId, status, amount: 15000, currency: 'XOF', hub2PaymentId: `hub_${id}`,
    createdAt: '2026-09-26T10:00:00.000Z', updatedAt: '2026-09-26T10:00:00.000Z',
  });

  it('🚨 n\'écrit QUE les lignes en écart ; l\'en-tête compte toujours toutes les lignes', async () => {
    // Au 25/09 : 8 564 lignes appariées sur 8 825, écrites à chaque clic et lues par personne -
    // 10 à 17 s d'écriture mesurées en production.
    const { service, snapshotsEcrits, lignesEcrites } = makeService({
      appCount: 2,
      appGross: 30000,
      appPayments: [
        { uuid: 'p1', transaction_id: 'plink_1', total_amount: 15000, payment_status: 'paid' },
        { uuid: 'p2', transaction_id: 'plink_2', total_amount: 15000, payment_status: 'paid' },
      ],
      gatewayPayments: [
        tentative('g1', 'plink_1'),
        tentative('g2', 'plink_2'),
        tentative('g3', 'plink_inconnu', 'failed'),
      ],
    });

    await service.refreshFromGateway();

    expect(lignesEcrites.map((l) => l.match_status)).toEqual([MatchStatus.UNMATCHED_HUB]);
    expect(snapshotsEcrits[0]).toMatchObject({
      hub_total_count: 3,
      matched_count: 2,
      unmatched_hub_count: 1,
      mismatch_count: 0,
    });
  });

  it('apparie en UNE seule lecture de `payments`, quel que soit le nombre de liens', async () => {
    // `payments.transaction_id` n'a pas d'index : chaque paquet `IN (500)` balayait toute la
    // table - 17 balayages pour les 9 323 tentatives du 26/09.
    const liens = Array.from({ length: 1200 }, (_, i) => tentative(`g${i}`, `plink_${i}`));
    const { service, paymentQb } = makeService({ gatewayPayments: liens });

    await service.refreshFromGateway();

    expect(paymentQb.getMany).toHaveBeenCalledTimes(1);
  });

  it('lit la liste du guichet, le solde et le côté application EN MÊME TEMPS', async () => {
    // En série, le relevé de solde (aller-retour guichet → HUB2) et l'agrégat s'ajoutaient à la
    // lecture de la liste. Partis ensemble, ils sont aussi pris au plus près du même instant.
    const { service, hubService, paymentQb } = makeService();
    let livrerListe!: (v: unknown) => void;
    hubService.listGatewayPayments.mockReturnValue(
      new Promise((resolve) => {
        livrerListe = resolve;
      }),
    );

    const rafraichissement = service.refreshFromGateway();
    await new Promise((resolve) => setImmediate(resolve));

    expect(hubService.getGatewayBalance).toHaveBeenCalled();
    expect(paymentQb.getRawOne).toHaveBeenCalled();

    livrerListe({ payments: [], total: 0, complet: true });
    await rafraichissement;
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
      // Aucun retrait enregistré : la ligne existe et vaut 0, elle ne disparaît pas.
      retraits: 0,
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

describe('Tableau de bord - solde HUB2 constaté', () => {
  it('extrait le compte de collecte XOF, insensible à la casse', async () => {
    const { service, hubService } = makeService();
    hubService.getGatewayBalance.mockResolvedValue({
      environment: 'live',
      collection: [{ currency: 'XOF', amount: 11397890, availableBalance: 11397890 }],
      transfer: [],
    });

    const solde = await service.liveBalance();

    expect(solde.collection_xof).toBe(11397890);
    expect(solde.environment).toBe('live');
  });

  it('rend null - jamais zéro - quand aucun compte XOF n\'existe', async () => {
    // Un zéro affirmerait un compte vide là où on n'a simplement rien pu lire.
    const { service, hubService } = makeService();
    hubService.getGatewayBalance.mockResolvedValue({ environment: 'live', collection: [], transfer: [] });

    const solde = await service.liveBalance();
    expect(solde.collection_xof).toBeNull();
  });

  it('stocke le solde constaté sur l\'instantané du rafraîchissement', async () => {
    const { service, snapshotsEcrits, hubService } = makeService();
    hubService.getGatewayBalance.mockResolvedValue({
      environment: 'live',
      collection: [{ currency: 'xof', amount: 11397890, availableBalance: 11397890 }],
      transfer: [],
    });

    await service.refreshFromGateway();
    expect(snapshotsEcrits[0].gateway_balance).toBe('11397890');
  });

  it('🚨 une panne du relevé de solde ne fait PAS échouer le rafraîchissement', async () => {
    // La liste du guichet est l'essentiel ; le solde est une preuve en plus. Échouer tout le
    // rafraîchissement parce que le relevé est en panne priverait l'écran de sa matière.
    const { service, snapshotsEcrits, hubService } = makeService();
    hubService.getGatewayBalance.mockRejectedValue(new Error('guichet muet'));

    await service.refreshFromGateway();

    expect(snapshotsEcrits).toHaveLength(1);
    expect(snapshotsEcrits[0].gateway_balance).toBeNull();
  });
});

describe('Tableau de bord - KPI par campagne', () => {
  it('agrège par statut ; collecté = montant des `paid` ; Total = somme des cartes', async () => {
    // La somme doit tomber juste : Total = Réussis + En cours + Échoués + Annulés. C'est la
    // raison d'être de la carte « Annulés » - sans elle, l'écran additionne faux.
    const { service, paymentQb } = makeService();
    paymentQb.getRawMany.mockResolvedValue([
      { statut: 'paid', nombre: '640', montant: '10170000' },
      { statut: 'pending', nombre: '99', montant: '1485000' },
      { statut: 'failed', nombre: '134', montant: '44500' },
      { statut: 'cancelled', nombre: '273', montant: '820000' },
    ]);

    const kpi = await service.campaignKpi({ type: 'subscription' });

    expect(kpi.paid).toEqual({ count: 640, amount: 10170000 });
    expect(kpi.pending).toEqual({ count: 99, amount: 1485000 });
    expect(kpi.failed).toEqual({ count: 134, amount: 44500 });
    expect(kpi.cancelled).toEqual({ count: 273, amount: 820000 });
    expect(kpi.total.count).toBe(640 + 99 + 134 + 273);
    expect(kpi.total.amount).toBe(10170000 + 1485000 + 44500 + 820000);
  });

  it('filtre par campagne quand un uuid est donné', async () => {
    const { service, paymentQb } = makeService();
    await service.campaignKpi({ type: 'donation', campaign_uuid: 'camp-1' });
    expect(paymentQb.andWhere).toHaveBeenCalledWith('p.source_uuid = :campagne', {
      campagne: 'camp-1',
    });
  });

  it('refuse un type inconnu - le contrat est subscription|donation', async () => {
    const { service } = makeService();
    await expect(service.campaignKpi({ type: 'boutique' })).rejects.toMatchObject({
      response: { data: { code: 'TYPE_INVALIDE' } },
    });
  });

  it('refuse un seau inconnu sur la liste des lignes', async () => {
    const { service } = makeService();
    await expect(
      service.campaignPayments({ type: 'subscription', bucket: 'gagnants' }),
    ).rejects.toMatchObject({ response: { data: { code: 'BUCKET_INVALIDE' } } });
  });

  it('pagine les lignes d\'une carte et rend le total - la modale doit afficher LE chiffre de la carte', async () => {
    const { service, paymentQb } = makeService();
    paymentQb.getManyAndCount.mockResolvedValue([
      [{
        uuid: 'p1', created_at: new Date('2026-08-01T05:00:00Z'), paid_at: null,
        beneficiary_name: 'AKA Marie', actor_name: 'AKA Marie', total_amount: 15000,
        provider: 'wave', payment_status: 'pending', failure_code: null,
        failure_message: null, transaction_id: 'plink_1', hub_payment_id: null,
      }],
      151,
    ]);

    const page = await service.campaignPayments({
      type: 'subscription', bucket: 'pending', page: 2, limit: 50,
    });

    expect(paymentQb.andWhere).toHaveBeenCalledWith('p.payment_status = :seau', {
      seau: 'pending',
    });
    expect(paymentQb.skip).toHaveBeenCalledWith(50);
    expect(paymentQb.take).toHaveBeenCalledWith(50);
    expect(page.total).toBe(151);
    expect(page.pages).toBe(4);
    expect(page.items[0].beneficiary_name).toBe('AKA Marie');
  });

  it('liste les campagnes du bon type (zaimu → donates), tous statuts', async () => {
    const { service, donateRepo, subscriptionRepo } = makeService({
      campagnesDons: [{
        uuid: 'd1', name: 'Zaimu 2026', amount: 0, status: 'started', category: 'libre',
        starts_at: new Date('2026-01-01'), stops_at: new Date('2026-12-31'),
      }],
    });

    const liste = await service.listStatsCampaigns('donation');

    expect(liste[0]).toMatchObject({ uuid: 'd1', name: 'Zaimu 2026', category: 'libre' });
    expect(donateRepo.find).toHaveBeenCalled();
    expect(subscriptionRepo.find).not.toHaveBeenCalled();
  });
});

/**
 * **Filtre « Structure » du bloc de lignes** (2026-09-27) : le tableau ET le fichier exporté
 * portent les lignes du seau limitées à la structure choisie - structure du BÉNÉFICIAIRE,
 * sous-arbre complet, la règle de RESPO-COMPTA-REGUL.
 */
describe('Tableau de bord - filtre « Structure » des lignes', () => {
  it('🚨 l’écran et l’export posent EXACTEMENT les mêmes conditions', async () => {
    // Le fichier doit rendre les lignes du tableau, ni plus ni moins : les deux passent par
    // `appliquerFiltresPaiementsCompta`, il n'y a plus de copie à tenir synchronisée.
    const { service, paymentQb } = makeService({ sousArbre: ['region-1', 'district-9'] });

    await service.campaignPayments({
      type: 'subscription',
      campaign_uuid: 'camp-1',
      bucket: 'failed',
      structure_uuid: 'region-1',
    });

    const fichier: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };
    appliquerFiltresPaiementsCompta(fichier, {
      type: 'subscription',
      campaign_uuid: 'camp-1',
      bucket: 'failed',
      structures: new Set(['region-1', 'district-9']),
    });

    expect(paymentQb.where.mock.calls).toEqual(fichier.where.mock.calls);
    expect(paymentQb.andWhere.mock.calls).toEqual(fichier.andWhere.mock.calls);
  });

  it('borne au sous-arbre COMPLET de la structure choisie, par le bénéficiaire', async () => {
    const { service, paymentQb, accessScope } = makeService({
      sousArbre: ['region-1', 'groupe-7'],
    });

    await service.campaignPayments({
      type: 'donation',
      bucket: 'paid',
      structure_uuid: 'region-1',
    });

    expect(accessScope.sousArbre).toHaveBeenCalledWith('region-1');
    expect(paymentQb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('p.beneficiary_uuid IN'),
      { perimetreStructures: ['region-1', 'groupe-7'] },
    );
  });

  it('sans structure choisie : toutes les lignes, aucun sous-arbre calculé', async () => {
    const { service, paymentQb, accessScope } = makeService();

    await service.campaignPayments({ type: 'subscription', bucket: 'paid' });

    expect(accessScope.sousArbre).not.toHaveBeenCalled();
    const conditions = paymentQb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(conditions.some((c: string) => /beneficiary_uuid/.test(c))).toBe(false);
  });

  it('structure inconnue : refus lisible, et aucune ligne lue', async () => {
    const { service, paymentQb } = makeService({ sousArbre: [] });

    await expect(
      service.campaignPayments({
        type: 'subscription',
        bucket: 'paid',
        structure_uuid: 'nexiste-pas',
      }),
    ).rejects.toMatchObject({ response: { data: { code: 'STRUCTURE_INCONNUE' } } });
    expect(paymentQb.getManyAndCount).not.toHaveBeenCalled();
  });
});

/**
 * **La cascade du filtre « Structure »** : les noms des structures, toute l'organisation.
 * Le rôle COMPTABLE n'est pas administrateur : la cascade partagée (`/structure/childrens`) est
 * bornée au périmètre du connecté et se viderait, sans message, dès le deuxième palier.
 */
describe('Tableau de bord - structures proposées au filtre', () => {
  it('sans parent : les enfants de la racine (les régions), avec leur palier', async () => {
    const { service, structureQb } = makeService({
      racine: { uuid: 'national' },
      enfants: [{ uuid: 'r1', name: 'ABIDJAN 1', palier: 'REGION' }],
    });

    const liste = await service.listFilterStructures();

    expect(structureQb.where).toHaveBeenCalledWith('s.parent_uuid = :parent', {
      parent: 'national',
    });
    expect(liste).toEqual([{ uuid: 'r1', name: 'ABIDJAN 1', palier: 'REGION' }]);
  });

  it('avec parent : ses enfants directs', async () => {
    const { service, structureQb } = makeService({
      enfants: [{ uuid: 'cr1', name: 'CR ABIDJAN NORD', palier: 'CENTRE_REGIONAL' }],
    });

    const liste = await service.listFilterStructures('r1');

    expect(structureQb.where).toHaveBeenCalledWith('s.parent_uuid = :parent', { parent: 'r1' });
    expect(liste).toEqual([{ uuid: 'cr1', name: 'CR ABIDJAN NORD', palier: 'CENTRE_REGIONAL' }]);
  });

  it('parent inconnu : refus lisible, pas une liste vide', async () => {
    const { service, structureQb } = makeService({ parentExiste: false });

    await expect(service.listFilterStructures('nexiste-pas')).rejects.toMatchObject({
      response: { data: { code: 'STRUCTURE_INCONNUE' } },
    });
    expect(structureQb.getRawMany).not.toHaveBeenCalled();
  });

  it('aucune racine en base : liste vide, sans requête d’enfants', async () => {
    const { service, structureQb } = makeService({ racine: null });

    await expect(service.listFilterStructures()).resolves.toEqual([]);
    expect(structureQb.getRawMany).not.toHaveBeenCalled();
  });
});

describe('Compte de retrait - lu chez HUB2', () => {
  // Le 16/09, 100 000 F ont quitté le compte de collecte HUB2 : du 16 au 25/09, le solde relevé
  // est resté 100 001 F sous le calcul (initial + brut - commission) et la situation globale était
  // rouge en production. Un retrait n'est ni un encaissement ni une commission : il a sa ligne.
  // Depuis le 27/09, il vient de HUB2 (approvisionnement collecte → transfert, relayé par le
  // guichet) : aucun retrait ne se crée dans l'application.
  const instantane2509 = {
    uuid: 's-2509', kind: SnapshotKind.GATEWAY, label: 'Guichet SOKA Pay',
    created_at: new Date('2026-09-25T16:35:54Z'), truncated: false,
    hub_success_count: 4804, hub_total_count: 8825, opening_balance: '196',
    hub_gross: '69062301', hub_fees: '1381246.02', hub_net: '67681054.98',
    gateway_balance: '67581250', period_start: null, period_end: null,
    matched_count: 8564, unmatched_hub_count: 260, unmatched_app_count: 0, mismatch_count: 1,
  };
  /** Le retrait réel du 16/09, tel que le guichet le relaie. */
  const retraitHub = (over: Record<string, unknown> = {}) => ({
    id: 'prov_IG5jhhHc2IZryqAyM0QDN',
    date: '2026-09-16T13:33:09.126Z',
    amount: 100000,
    currency: 'XOF',
    status: 'successful',
    description: 'Test Virement vers Banque',
    failureCause: null,
    ...over,
  });
  const refusAvecCode = (code: string) =>
    expect.objectContaining({ response: expect.objectContaining({ data: expect.objectContaining({ code }) }) });

  it('🚨 le décompte retranche les retraits HUB2 : initial + brut - commission - retraits = net attendu', async () => {
    const { service } = makeService({ dernierSnapshot: instantane2509, retraitsHub: [retraitHub()] });

    const vue = await service.overview();

    expect(vue.gateway?.decompte).toEqual({
      solde_ouverture: 196,
      encaissements: 69062301,
      frais: -1381246.02,
      retraits: -100000,
      solde_attendu: 67581250.98,
    });
    // Le solde relevé ce jour-là retombe sur le calcul, à l'arrondi des frais près.
    expect(Math.abs(67581250 - (vue.gateway?.decompte.solde_attendu ?? 0))).toBeLessThan(1);
  });

  it('seul un retrait RÉUSSI a débité la collecte : un échec ou un retrait en cours ne se retranche pas', async () => {
    const { service } = makeService({
      dernierSnapshot: instantane2509,
      retraitsHub: [
        retraitHub(),
        retraitHub({ id: 'prov_echec', status: 'failed', amount: 30000 }),
        retraitHub({ id: 'prov_attente', status: 'pending', amount: 20000 }),
      ],
    });

    const vue = await service.overview();

    expect(vue.gateway?.decompte.retraits).toBe(-100000);
  });

  it('🚨 HUB2 illisible : ni retraits ni solde attendu - jamais un zéro inventé', async () => {
    // Retrancher 0 faute de lecture afficherait un écart de 100 000 F qui n'existe pas.
    const { service } = makeService({ dernierSnapshot: instantane2509, retraitsIndisponibles: true });

    const vue = await service.overview();

    expect(vue.gateway?.decompte.retraits).toBeNull();
    expect(vue.gateway?.decompte.solde_attendu).toBeNull();
    // Le reste de l'écran ne tombe pas avec eux.
    expect(vue.gateway?.gross).toBe(69062301);
  });

  it('liste les retraits HUB2, les plus récents d’abord, avec le total de ceux qui ont débité la collecte', async () => {
    const { service, hubService } = makeService({
      retraitsHub: [
        retraitHub({ id: 'prov_2', date: '2026-09-20T08:00:00.000Z', amount: 25000 }),
        retraitHub(),
        retraitHub({ id: 'prov_0', date: '2026-09-10T08:00:00.000Z', status: 'failed', amount: 5000 }),
      ],
    });

    const liste = await service.listWithdrawals();

    expect(hubService.listGatewayWithdrawals).toHaveBeenCalledTimes(1);
    expect(liste.total).toBe(125000);
    expect(liste.count).toBe(3);
    expect(liste.items[0]).toEqual({
      id: 'prov_2',
      withdrawn_at: '2026-09-20T08:00:00.000Z',
      amount: 25000,
      currency: 'XOF',
      status: 'successful',
      description: 'Test Virement vers Banque',
      failure_reason: null,
    });
    expect(liste.items[2]).toMatchObject({ id: 'prov_0', status: 'failed' });
  });

  it('dit pourquoi un retrait a échoué', async () => {
    const { service } = makeService({
      retraitsHub: [
        retraitHub({ status: 'failed', failureCause: { code: 'insufficient_funds', message: 'Fonds insuffisants.' } }),
      ],
    });

    const liste = await service.listWithdrawals();

    expect(liste.items[0].failure_reason).toBe('Fonds insuffisants.');
    expect(liste.total).toBe(0);
  });

  it('HUB2 illisible : refus lisible avec son code, pas une liste vide', async () => {
    const { service } = makeService({ retraitsIndisponibles: true });

    await expect(service.listWithdrawals()).rejects.toEqual(refusAvecCode('RETRAITS_INDISPONIBLES'));
  });

  it('🚨 aucun retrait ne se crée dans l’application : le contrôleur ne sert que des lectures', () => {
    const proto = AccountingWithdrawalsController.prototype as unknown as Record<string, unknown>;
    const verbes = Object.getOwnPropertyNames(proto)
      .filter((nom) => nom !== 'constructor')
      .map((nom) => Reflect.getMetadata(METHOD_METADATA, proto[nom] as object))
      .filter((verbe) => verbe !== undefined);

    expect(verbes).toEqual([RequestMethod.GET]);
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
