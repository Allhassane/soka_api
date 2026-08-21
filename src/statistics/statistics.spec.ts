/// <reference types="jest" />
import {
  AGE_BUCKETS,
  ANCIENNETE_BUCKETS,
  buildMemberWhere,
  bucketCase,
  AGE_EXPR,
  AGE_PLAUSIBLE,
  taux,
} from './statistics.helpers';
import { StatisticsService } from './statistics.service';

/**
 * Ce que ces tests verrouillent, par ordre d'importance :
 *
 * 1. **Le périmètre ne s'ouvre jamais.** Un non-administrateur sans racine doit voir
 *    ZÉRO membre, pas tous. C'est la régression qui a coûté une fuite de tout l'arbre en
 *    juillet 2025 (il suffisait de changer l'uuid dans l'URL).
 * 2. **`structure_uuid` restreint, il n'élargit pas** : les deux conditions se cumulent.
 * 3. **Les taux ne divisent jamais par zéro** et distinguent activation et réussite - les
 *    deux indicateurs que le mot « taux de connexion » confond.
 * 4. **Les dates invraisemblables sont exclues des calculs**, jamais silencieusement
 *    incluses (naissance en 0199, adhésion en 3013).
 */

const ADMIN = { isAdmin: true, allowedRootUuids: [] };
const RESP = { isAdmin: false, allowedRootUuids: ['racine-1'] };

describe('buildMemberWhere - périmètre', () => {
  it("n'ajoute aucune restriction pour un administrateur", () => {
    const w = buildMemberWhere({}, ADMIN);
    expect(w.sql).toBe('');
    expect(w.params).toEqual([]);
  });

  it('borne un responsable au sous-arbre de sa racine', () => {
    const w = buildMemberWhere({}, RESP);
    expect(w.sql).toContain('structure_closure');
    expect(w.sql).toContain('m.structure_uuid IN');
    expect(w.params).toEqual(['racine-1']);
  });

  // 🚨 Le test le plus important du fichier.
  it('ne montre RIEN à un non-administrateur sans racine de périmètre', () => {
    const w = buildMemberWhere({}, { isAdmin: false, allowedRootUuids: [] });
    expect(w.sql).toContain('1 = 0');
    // Et surtout : aucune ouverture déguisée.
    expect(w.sql).not.toContain('1 = 1');
  });

  it('ignore les racines vides plutôt que de les passer en paramètre', () => {
    const w = buildMemberWhere({}, { isAdmin: false, allowedRootUuids: ['', null as any] });
    expect(w.sql).toContain('1 = 0');
    expect(w.params).toEqual([]);
  });

  it('CUMULE la structure choisie et le périmètre (elle restreint, elle n’élargit pas)', () => {
    const w = buildMemberWhere({ structure_uuid: 'autre-structure' }, RESP);
    // Les deux sous-requêtes sont présentes, reliées par AND.
    expect(w.sql.match(/structure_closure/g)?.length).toBe(2);
    expect(w.params).toEqual(['racine-1', 'autre-structure']);
  });
});

describe('buildMemberWhere - filtres', () => {
  it('traite « non_renseignee » comme une valeur de division à part entière', () => {
    const w = buildMemberWhere({ division_uuid: 'non_renseignee' }, ADMIN);
    expect(w.sql).toContain('m.division_uuid IS NULL');
    // Surtout pas passé en paramètre : ce n'est pas un uuid.
    expect(w.params).toEqual([]);
  });

  it('filtre sur une division réelle par paramètre', () => {
    const w = buildMemberWhere({ division_uuid: 'div-1' }, ADMIN);
    expect(w.sql).toContain('m.division_uuid = ?');
    expect(w.params).toEqual(['div-1']);
  });

  it('garde les dates invraisemblables hors de la tranche d’âge', () => {
    const w = buildMemberWhere({ age_bucket: 'moins_18' }, ADMIN);
    // Sans cette garde, une naissance en 2070 tomberait dans « moins de 18 ans ».
    expect(w.sql).toContain('BETWEEN 0 AND 110');
    expect(w.sql).toContain('BETWEEN 0 AND 17');
  });

  it('sait isoler les âges non renseignés', () => {
    const w = buildMemberWhere({ age_bucket: 'non_renseigne' }, ADMIN);
    expect(w.sql).toContain('NOT (');
  });

  it('borne la période sur la date d’ADHÉSION, jamais sur created_at', () => {
    const w = buildMemberWhere({ from: '2020-01-01', to: '2024-12-31' }, ADMIN);
    expect(w.sql).toContain('m.membership_date >= ?');
    expect(w.sql).toContain('m.membership_date <= ?');
    expect(w.sql).not.toContain('created_at');
    expect(w.params).toEqual(['2020-01-01', '2024-12-31']);
  });

  it('traduit l’état du compte en conditions sur users', () => {
    expect(buildMemberWhere({ account_status: 'sent_not_connected' }, ADMIN).sql).toContain(
      'u.is_sent = 1',
    );
    expect(buildMemberWhere({ account_status: 'no_account' }, ADMIN).sql).toContain(
      'u.uuid IS NULL',
    );
    expect(buildMemberWhere({ account_status: 'default_password' }, ADMIN).sql).toContain(
      'u.must_change_password = 1',
    );
  });

  it('cumule tous les filtres avec des AND, dans l’ordre des paramètres', () => {
    const w = buildMemberWhere(
      { gender: 'femme', department_uuid: 'dep-1', city_uuid: 'ville-9' },
      ADMIN,
    );
    expect(w.params).toEqual(['dep-1', 'femme', 'ville-9']);
    expect(w.sql.startsWith(' AND ')).toBe(true);
  });
});

describe('bucketCase', () => {
  it('range chaque valeur dans sa tranche et le reste en non renseigné', () => {
    const sql = bucketCase(AGE_EXPR, AGE_PLAUSIBLE, AGE_BUCKETS);
    expect(sql).toContain("THEN 'moins_18'");
    expect(sql).toContain("THEN '60_plus'");
    expect(sql).toContain("ELSE 'non_renseigne'");
    // La garde de plausibilité passe AVANT les tranches, sinon une date aberrante
    // atterrirait dans une tranche réelle.
    expect(sql.indexOf('non_renseigne')).toBeLessThan(sql.indexOf("THEN 'moins_18'"));
  });

  it('couvre toutes les tranches d’ancienneté sans trou', () => {
    for (let annees = 0; annees <= 40; annees++) {
      const trouve = ANCIENNETE_BUCKETS.some(
        (b) => annees >= b.min && (b.max === null || annees <= b.max),
      );
      expect(trouve).toBe(true);
    }
  });
});

describe('taux', () => {
  it('ne divise jamais par zéro', () => {
    expect(taux(5, 0)).toBe(0);
    expect(taux(0, 0)).toBe(0);
    expect(taux(5, -1)).toBe(0);
  });

  it('arrondit à une décimale', () => {
    expect(taux(1027, 1129)).toBe(91);
    expect(taux(1336, 8023)).toBe(16.7);
    expect(taux(1, 3)).toBe(33.3);
  });
});

/**
 * Le cœur de la demande utilisateur : « taux de connexion réussi ». Deux indicateurs
 * différents que le même mot recouvre - on vérifie qu'ils ne sont pas confondus et
 * qu'ils lisent les bons numérateurs.
 */
describe('StatisticsService.adoption - activation vs réussite', () => {
  function serviceAvecLignes(premiere: Record<string, any>) {
    const query = jest.fn(async (sql: string) => {
      if (/FROM login_logs/.test(sql)) return [{ depuis: null, lignes: 0 }];
      if (/subscription_payments/.test(sql)) return [{ base: 100, participants: 10 }];
      if (/GROUP BY d\.uuid/.test(sql)) return [];
      return [premiere];
    });
    return { service: new StatisticsService({ query } as any), query };
  }

  it('distingue le taux d’activation du taux de réussite', async () => {
    const { service } = serviceAvecLignes({
      membres: 8033,
      comptes: 8023,
      sans_compte: 10,
      mdp_envoyes: 1128,
      connectes: 1336,
      envoyes_et_connectes: 1026,
      bloques: 102,
      mdp_defaut: 127,
      connectes_sans_sms: 310,
      avec_telephone: 8028,
      avec_whatsapp: 6869,
      avec_email: 3930,
    });

    const r: any = await service.adoption({}, ADMIN);

    // Activation = connectés / comptes : la mesure de l'adoption réelle.
    expect(r.taux.activation).toBe(16.7);
    // Réussite = connectés PARMI CEUX qui ont reçu un mot de passe : la mesure du parcours.
    // 1 026 / 1 128 = 90,957 % → 91,0 après arrondi à la décimale.
    expect(r.taux.reussite).toBe(91);
    // Les deux ne doivent jamais être égaux ici - c'est tout l'intérêt de les séparer.
    expect(r.taux.activation).not.toBe(r.taux.reussite);
    // Les bloqués sont une liste à rappeler, pas une statistique de plus.
    expect(r.alertes.bloques).toBe(102);
  });

  it('annonce le journal de connexion indisponible tant qu’aucune ligne n’existe', async () => {
    const { service } = serviceAvecLignes({ membres: 0, comptes: 0 });
    const r: any = await service.adoption({}, ADMIN);
    // ⚠️ Sans ce drapeau, l'écran afficherait « 0 connexion sur 30 jours » et laisserait
    // croire à un effondrement de l'usage, alors que le journal vient d'être ouvert.
    expect(r.journal.disponible).toBe(false);
    expect(r.journal.depuis).toBeNull();
  });

  it('ne remonte les IP suspectes qu’à un administrateur', async () => {
    const { service, query } = serviceAvecLignes({ membres: 1, comptes: 1 });
    // Journal alimenté : la branche « IP suspectes » devient atteignable.
    query.mockImplementation(async (sql: string) => {
      if (/MIN\(created_at\)/.test(sql)) return [{ depuis: '2026-08-19', lignes: 5 }];
      if (/GROUP BY ll\.ip/.test(sql)) return [{ ip: '1.2.3.4', echecs: 40, comptes_vises: 12 }];
      if (/FROM login_logs/.test(sql)) return [{}];
      if (/subscription_payments/.test(sql)) return [{ base: 1, participants: 0 }];
      return [{ membres: 1, comptes: 1 }];
    });

    const vueAdmin: any = await service.adoption({}, ADMIN);
    expect(vueAdmin.journal.ips_suspectes).toHaveLength(1);

    // Un responsable n'y a pas droit : une IP n'a pas de structure, elle ne peut pas être
    // bornée par le périmètre - donc elle ne sort pas.
    const vueResp: any = await service.adoption({}, { isAdmin: false, allowedRootUuids: ['r'] });
    expect(vueResp.journal.ips_suspectes).toEqual([]);
  });
});
