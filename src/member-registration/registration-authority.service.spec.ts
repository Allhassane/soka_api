import { Repository } from 'typeorm';
import { LevelEntity } from 'src/level/entities/level.entity';
import { MemberResponsibilityEntity } from 'src/member-responsibility/entities/member-responsibility.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { User } from 'src/users/entities/user.entity';
import {
  ResponsibilityAnchorService,
  StructureIndex,
} from 'src/member-transfer/responsibility-anchor.service';
import {
  RegistrationStatus,
  StepDecision,
  ValidationLevel,
} from './entities/member-registration.entity';
import {
  AuthorityAnchor,
  RegistrationAuthorityService,
  hasAuthorityOver,
  planSteps,
} from './registration-authority.service';

/**
 * Autorité de validation d'un enregistrement de membre (`docs/VALIDATION-MEMBRES.md` §4-§5).
 *
 * Deux règles se partagent ce fichier :
 * - **R4** - une étape est acquise d'office si le déposant a déjà autorité à ce niveau **ou
 *   au-dessus**, et **sur ce dossier-là** (comparaison d'ancres).
 * - **R5 / R5b** - la signature est stricte (niveau exact), sauf si ce niveau est **vacant** :
 *   la suppléance s'ouvre alors au niveau immédiatement supérieur. Elle est **calculée, jamais
 *   choisie**.
 */

const LVL = {
  national: 'lvl-national',
  region: 'lvl-region',
  centreRegional: 'lvl-centre-regional',
  centre: 'lvl-centre',
  chapitre: 'lvl-chapitre',
  district: 'lvl-district',
  groupe: 'lvl-groupe',
  sousGroupe: 'lvl-sous-groupe',
};

const ORDER: Record<string, number> = {
  [LVL.national]: 0,
  [LVL.region]: 1,
  [LVL.centreRegional]: 2,
  [LVL.centre]: 3,
  [LVL.chapitre]: 4,
  [LVL.district]: 5,
  [LVL.groupe]: 6,
  [LVL.sousGroupe]: 7,
};

/**
 * Arbre de test - repris de `responsibility-anchor.service.spec.ts` pour que les deux règles
 * se raisonnent sur la même hiérarchie.
 *
 *  NATIONAL
 *  └── REGION_A
 *      ├── CR_1 ─── CENTRE_X ─┬─ CHAPITRE_1 ─┬─ DISTRICT_1 ─┬─ GROUPE_1 ─ SOUS_GROUPE_1
 *      │                      │              │              └─ GROUPE_2
 *      │                      │              └─ DISTRICT_2 ─── GROUPE_3
 *      │                      └─ CHAPITRE_2 ─── DISTRICT_3 ─── GROUPE_4
 *      └── CR_2 ─── CENTRE_Z ─── CHAPITRE_4 ─── DISTRICT_5 ─── GROUPE_6
 */
const ROWS: Array<[string, string | null, string | null]> = [
  ['NATIONAL', null, LVL.national],
  ['REGION_A', 'NATIONAL', LVL.region],
  ['CR_1', 'REGION_A', LVL.centreRegional],
  ['CENTRE_X', 'CR_1', LVL.centre],
  ['CHAPITRE_1', 'CENTRE_X', LVL.chapitre],
  ['DISTRICT_1', 'CHAPITRE_1', LVL.district],
  ['GROUPE_1', 'DISTRICT_1', LVL.groupe],
  ['SOUS_GROUPE_1', 'GROUPE_1', LVL.sousGroupe],
  ['GROUPE_2', 'DISTRICT_1', LVL.groupe],
  ['DISTRICT_2', 'CHAPITRE_1', LVL.district],
  ['GROUPE_3', 'DISTRICT_2', LVL.groupe],
  ['CHAPITRE_2', 'CENTRE_X', LVL.chapitre],
  ['DISTRICT_3', 'CHAPITRE_2', LVL.district],
  ['GROUPE_4', 'DISTRICT_3', LVL.groupe],
  ['CR_2', 'REGION_A', LVL.centreRegional],
  ['CENTRE_Z', 'CR_2', LVL.centre],
  ['CHAPITRE_4', 'CENTRE_Z', LVL.chapitre],
  ['DISTRICT_5', 'CHAPITRE_4', LVL.district],
  ['GROUPE_6', 'DISTRICT_5', LVL.groupe],
];

const index: StructureIndex = new Map(
  ROWS.map(([uuid, parent_uuid, level_uuid]) => [
    uuid,
    { uuid, parent_uuid, level_uuid },
  ]),
);

/** Raccourci : « responsable de niveau L, ancré sur S ». */
const anchor = (level_uuid: string, anchor_structure_uuid: string): AuthorityAnchor => ({
  level_uuid,
  level_name: level_uuid.replace('lvl-', '').toUpperCase(),
  level_order: ORDER[level_uuid],
  anchor_structure_uuid,
});

const DISTRICT_ORDER = ORDER[LVL.district];
const CHAPITRE_ORDER = ORDER[LVL.chapitre];

describe('hasAuthorityOver (R4)', () => {
  it('reconnaît le responsable du district sur un dossier de son district', () => {
    expect(
      hasAuthorityOver(
        index,
        [anchor(LVL.district, 'DISTRICT_1')],
        'SOUS_GROUPE_1',
        DISTRICT_ORDER,
      ),
    ).toBe(true);
  });

  it('refuse le responsable d’un AUTRE district — être responsable de district ne suffit pas', () => {
    expect(
      hasAuthorityOver(
        index,
        [anchor(LVL.district, 'DISTRICT_2')],
        'SOUS_GROUPE_1',
        DISTRICT_ORDER,
      ),
    ).toBe(false);
  });

  it('reconnaît un niveau supérieur (chapitre) sur l’étape district', () => {
    expect(
      hasAuthorityOver(
        index,
        [anchor(LVL.chapitre, 'CHAPITRE_1')],
        'SOUS_GROUPE_1',
        DISTRICT_ORDER,
      ),
    ).toBe(true);
  });

  it('refuse un chapitre voisin', () => {
    expect(
      hasAuthorityOver(
        index,
        [anchor(LVL.chapitre, 'CHAPITRE_2')],
        'SOUS_GROUPE_1',
        DISTRICT_ORDER,
      ),
    ).toBe(false);
  });

  it('refuse un niveau inférieur (groupe) sur l’étape district', () => {
    expect(
      hasAuthorityOver(
        index,
        [anchor(LVL.groupe, 'GROUPE_1')],
        'SOUS_GROUPE_1',
        DISTRICT_ORDER,
      ),
    ).toBe(false);
  });

  it('refuse quand le déposant n’a aucune responsabilité', () => {
    expect(hasAuthorityOver(index, [], 'SOUS_GROUPE_1', DISTRICT_ORDER)).toBe(false);
  });
});

describe('planSteps (R4)', () => {
  const plan = (anchors: AuthorityAnchor[], isAdmin = false, structure = 'SOUS_GROUPE_1') =>
    planSteps({
      index,
      anchors,
      structureUuid: structure,
      districtUuid: structure === 'CHAPITRE_1' ? null : 'DISTRICT_1',
      chapitreUuid: 'CHAPITRE_1',
      districtOrder: DISTRICT_ORDER,
      chapitreOrder: CHAPITRE_ORDER,
      isAdmin,
    });

  it('déposant sans autorité : les deux signatures sont requises', () => {
    expect(plan([])).toEqual({
      district: StepDecision.EN_ATTENTE,
      chapitre: StepDecision.EN_ATTENTE,
      status: RegistrationStatus.EN_ATTENTE_DISTRICT,
      blocked: null,
    });
  });

  it('responsable de groupe : les deux signatures sont requises', () => {
    expect(plan([anchor(LVL.groupe, 'GROUPE_1')]).status).toBe(
      RegistrationStatus.EN_ATTENTE_DISTRICT,
    );
  });

  it('responsable de district : l’étape district est acquise, le chapitre reste à signer', () => {
    expect(plan([anchor(LVL.district, 'DISTRICT_1')])).toMatchObject({
      district: StepDecision.ACQUISE,
      chapitre: StepDecision.EN_ATTENTE,
      status: RegistrationStatus.EN_ATTENTE_CHAPITRE,
    });
  });

  it('responsable de chapitre : le membre est validé d’emblée — un dossier ne redescend jamais', () => {
    expect(plan([anchor(LVL.chapitre, 'CHAPITRE_1')])).toMatchObject({
      district: StepDecision.ACQUISE,
      chapitre: StepDecision.ACQUISE,
      status: RegistrationStatus.VALIDEE,
    });
  });

  it('is_admin : tout est acquis, même sans aucune responsabilité', () => {
    expect(plan([], true)).toMatchObject({
      district: StepDecision.ACQUISE,
      chapitre: StepDecision.ACQUISE,
      status: RegistrationStatus.VALIDEE,
    });
  });

  it('responsable d’un autre district : rien n’est acquis', () => {
    expect(plan([anchor(LVL.district, 'DISTRICT_2')])).toMatchObject({
      district: StepDecision.EN_ATTENTE,
      status: RegistrationStatus.EN_ATTENTE_DISTRICT,
    });
  });

  it('saisie sur un CHAPITRE : l’étape district est SANS_OBJET, le chapitre signe seul', () => {
    expect(plan([], false, 'CHAPITRE_1')).toEqual({
      district: StepDecision.SANS_OBJET,
      chapitre: StepDecision.EN_ATTENTE,
      status: RegistrationStatus.EN_ATTENTE_CHAPITRE,
      blocked: null,
    });
  });

  describe('saisie au-dessus du chapitre — aucune étape opposable', () => {
    const planHaut = (anchors: AuthorityAnchor[], isAdmin = false) =>
      planSteps({
        index,
        anchors,
        structureUuid: 'CENTRE_X',
        districtUuid: null,
        chapitreUuid: null,
        districtOrder: DISTRICT_ORDER,
        chapitreOrder: CHAPITRE_ORDER,
        isAdmin,
      });

    it('est refusée à un responsable de groupe — sinon le circuit se contourne', () => {
      expect(planHaut([anchor(LVL.groupe, 'GROUPE_1')]).blocked).toEqual(
        expect.stringContaining('district'),
      );
    });

    it('est acceptée pour un responsable de centre', () => {
      expect(planHaut([anchor(LVL.centre, 'CENTRE_X')])).toMatchObject({
        blocked: null,
        status: RegistrationStatus.VALIDEE,
      });
    });

    it('est acceptée pour un is_admin', () => {
      expect(planHaut([], true).blocked).toBeNull();
    });
  });
});

describe('RegistrationAuthorityService', () => {
  const structures = ROWS.map(([uuid, parent_uuid, level_uuid]) => ({
    uuid,
    parent_uuid,
    level_uuid,
  }));

  const levels = [
    { uuid: LVL.national, name: 'NATIONAL', order: 0 },
    { uuid: LVL.centre, name: 'CENTRE', order: 3 },
    { uuid: LVL.chapitre, name: 'Chapitre', order: 4 },
    { uuid: LVL.district, name: 'District', order: 5 },
    { uuid: LVL.groupe, name: 'GROUPE', order: 6 },
    { uuid: LVL.sousGroupe, name: 'SOUS_GROUPE', order: 7 },
    // Homonyme de la catégorie « responsibility », porté par aucune structure : il ne doit
    // jamais servir d'ancre (même piège que `resolveLevelUuidByName`).
    { uuid: 'lvl-district-responsabilite', name: 'DISTRICT', order: 99 },
  ];

  /** Responsabilités du membre interrogé par `authorityAnchors`. */
  let responsibilityRows: Array<{ level_uuid: string | null }>;
  /** Porteurs de responsabilité, tous niveaux confondus, vus par `signerUserUuids`. */
  let signerRows: Array<{
    user_uuid: string;
    structure_uuid: string | null;
    level_uuid: string;
  }>;
  let membreDuUser: { uuid: string; structure_uuid: string } | null;

  const buildService = () => {
    const structureRepository = {
      find: jest.fn().mockResolvedValue(structures),
    } as unknown as Repository<StructureEntity>;

    const levelRepository = {
      find: jest.fn().mockResolvedValue(levels),
    } as unknown as Repository<LevelEntity>;

    // Un seul faux QueryBuilder pour les deux requêtes du service : on distingue par le
    // paramètre passé au `where` (`levelUuid` ⇒ recherche de signataires).
    const makeQueryBuilder = () => {
      let params: Record<string, any> = {};
      const qb: any = {
        innerJoin: jest.fn(() => qb),
        leftJoin: jest.fn(() => qb),
        select: jest.fn(() => qb),
        where: jest.fn((_: string, p: Record<string, any> = {}) => {
          params = { ...params, ...p };
          return qb;
        }),
        andWhere: jest.fn((_: string, p: Record<string, any> = {}) => {
          params = { ...params, ...p };
          return qb;
        }),
        getRawMany: jest.fn(async () =>
          params.levelUuid
            ? signerRows.filter((r) => r.level_uuid === params.levelUuid)
            : responsibilityRows,
        ),
      };
      return qb;
    };

    const memberResponsibilityRepository = {
      createQueryBuilder: jest.fn(() => makeQueryBuilder()),
    } as unknown as Repository<MemberResponsibilityEntity>;

    const memberRepository = {
      findOne: jest.fn(async () => membreDuUser),
    } as unknown as Repository<MemberEntity>;

    const userRepository = {
      findOne: jest.fn(async () => ({
        uuid: 'u-1',
        member_uuid: membreDuUser?.uuid ?? null,
      })),
    } as unknown as Repository<User>;

    const anchorService = new ResponsibilityAnchorService(
      structureRepository,
      levelRepository,
      memberResponsibilityRepository,
    );

    return new RegistrationAuthorityService(
      anchorService,
      levelRepository,
      memberResponsibilityRepository,
      memberRepository,
      userRepository,
    );
  };

  beforeEach(() => {
    responsibilityRows = [];
    signerRows = [];
    membreDuUser = { uuid: 'm-1', structure_uuid: 'GROUPE_2' };
  });

  it('ne retient que les niveaux portés par l’arbre, du plus élevé au plus bas', async () => {
    const service = buildService();
    const ordered = await service.orderedLevels(index);

    expect(ordered.map((l) => l.name)).toEqual([
      'NATIONAL',
      'CENTRE',
      'CHAPITRE',
      'DISTRICT',
      'GROUPE',
      'SOUS_GROUPE',
    ]);
    expect(ordered.find((l) => l.name === 'DISTRICT')?.uuid).toBe(LVL.district);
  });

  it('ancre une responsabilité sur la structure dirigée, pas sur celle où le porteur habite', async () => {
    // Responsable de district vivant dans GROUPE_2 : son ancre est DISTRICT_1.
    responsibilityRows = [{ level_uuid: LVL.district }];
    const service = buildService();
    const levelsOrdonnes = await service.orderedLevels(index);

    await expect(
      service.authorityAnchors('u-1', index, levelsOrdonnes),
    ).resolves.toEqual([
      {
        level_uuid: LVL.district,
        level_name: 'DISTRICT',
        level_order: 5,
        anchor_structure_uuid: 'DISTRICT_1',
      },
    ]);
  });

  it('ignore une responsabilité sans niveau — fail closed (104 porteurs en base)', async () => {
    responsibilityRows = [{ level_uuid: null }];
    const service = buildService();
    const levelsOrdonnes = await service.orderedLevels(index);

    await expect(
      service.authorityAnchors('u-1', index, levelsOrdonnes),
    ).resolves.toEqual([]);
  });

  describe('canSign (R5 / R5b)', () => {
    const dossier = {
      structure_uuid: 'SOUS_GROUPE_1',
      district_uuid: 'DISTRICT_1',
      chapitre_uuid: 'CHAPITRE_1',
    };

    const RESP_DISTRICT_1 = {
      user_uuid: 'u-district-1',
      structure_uuid: 'GROUPE_2',
      level_uuid: LVL.district,
    };
    const RESP_CHAPITRE_1 = {
      user_uuid: 'u-chapitre-1',
      structure_uuid: 'GROUPE_3',
      level_uuid: LVL.chapitre,
    };
    const RESP_DISTRICT_2 = {
      user_uuid: 'u-district-2',
      structure_uuid: 'GROUPE_3',
      level_uuid: LVL.district,
    };

    it('autorise le responsable du district, sans suppléance', async () => {
      signerRows = [RESP_DISTRICT_1, RESP_CHAPITRE_1];
      await expect(
        buildService().canSign(
          'u-district-1',
          false,
          ValidationLevel.DISTRICT,
          dossier,
        ),
      ).resolves.toEqual({ allowed: true, by_delegation: false });
    });

    it('refuse le responsable d’un district voisin', async () => {
      signerRows = [RESP_DISTRICT_1, RESP_DISTRICT_2];
      await expect(
        buildService().canSign(
          'u-district-2',
          false,
          ValidationLevel.DISTRICT,
          dossier,
        ),
      ).resolves.toEqual({ allowed: false, by_delegation: false });
    });

    it('refuse le chapitre sur l’étape district tant que le district est pourvu', async () => {
      signerRows = [RESP_DISTRICT_1, RESP_CHAPITRE_1];
      await expect(
        buildService().canSign(
          'u-chapitre-1',
          false,
          ValidationLevel.DISTRICT,
          dossier,
        ),
      ).resolves.toEqual({ allowed: false, by_delegation: false });
    });

    it('ouvre la suppléance au chapitre dès que le district est vacant', async () => {
      signerRows = [RESP_CHAPITRE_1]; // plus aucun responsable de DISTRICT_1
      await expect(
        buildService().canSign(
          'u-chapitre-1',
          false,
          ValidationLevel.DISTRICT,
          dossier,
        ),
      ).resolves.toEqual({ allowed: true, by_delegation: true });
    });

    it('autorise le responsable du chapitre sur son étape', async () => {
      signerRows = [RESP_DISTRICT_1, RESP_CHAPITRE_1];
      await expect(
        buildService().canSign(
          'u-chapitre-1',
          false,
          ValidationLevel.CHAPITRE,
          dossier,
        ),
      ).resolves.toEqual({ allowed: true, by_delegation: false });
    });

    it('laisse is_admin en dernier recours', async () => {
      signerRows = [RESP_DISTRICT_1];
      await expect(
        buildService().canSign('u-inconnu', true, ValidationLevel.DISTRICT, dossier),
      ).resolves.toEqual({ allowed: true, by_delegation: false });
    });

    it('refuse toute signature sur une étape SANS_OBJET, même à un is_admin', async () => {
      signerRows = [RESP_DISTRICT_1];
      await expect(
        buildService().canSign('u-inconnu', true, ValidationLevel.DISTRICT, {
          ...dossier,
          district_uuid: null,
        }),
      ).resolves.toEqual({ allowed: false, by_delegation: false });
    });
  });

  it('détecte un niveau vacant sur une structure donnée (R13)', async () => {
    signerRows = [
      { user_uuid: 'u-district-1', structure_uuid: 'GROUPE_2', level_uuid: LVL.district },
    ];
    const service = buildService();

    await expect(service.isLevelVacant('DISTRICT', 'DISTRICT_1')).resolves.toBe(false);
    await expect(service.isLevelVacant('DISTRICT', 'DISTRICT_2')).resolves.toBe(true);
  });
});
