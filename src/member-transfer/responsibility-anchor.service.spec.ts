import { Repository } from 'typeorm';
import { LevelEntity } from 'src/level/entities/level.entity';
import { MemberResponsibilityEntity } from 'src/member-responsibility/entities/member-responsibility.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import {
  ResponsibilityAnchorService,
  StructureIndex,
  ancestorAtLevel,
  evaluateAnchor,
} from './responsibility-anchor.service';

/**
 * Règle R8 - ancre de responsabilité (`docs/TRANSFERT-MEMBRES.md` §5).
 *
 * Une responsabilité de niveau L est conservée ssi
 * `ancêtre(structure_nouvelle, L) === ancêtre(structure_ancienne, L)`.
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

/**
 * Arbre de test.
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

const buildIndex = (
  rows: Array<[string, string | null, string | null]> = ROWS,
): StructureIndex =>
  new Map(
    rows.map(([uuid, parent_uuid, level_uuid]) => [
      uuid,
      { uuid, parent_uuid, level_uuid },
    ]),
  );

describe('ancestorAtLevel', () => {
  const index = buildIndex();

  it('remonte jusqu’à l’ancêtre du niveau demandé', () => {
    expect(ancestorAtLevel(index, 'SOUS_GROUPE_1', LVL.district)).toBe('DISTRICT_1');
    expect(ancestorAtLevel(index, 'SOUS_GROUPE_1', LVL.centre)).toBe('CENTRE_X');
    expect(ancestorAtLevel(index, 'GROUPE_6', LVL.national)).toBe('NATIONAL');
  });

  it('retourne la structure elle-même si elle porte déjà le niveau', () => {
    expect(ancestorAtLevel(index, 'DISTRICT_1', LVL.district)).toBe('DISTRICT_1');
  });

  it('retourne null pour un niveau absent du chemin, une structure inconnue ou une entrée vide', () => {
    expect(ancestorAtLevel(index, 'GROUPE_1', LVL.sousGroupe)).toBeNull();
    expect(ancestorAtLevel(index, 'INCONNUE', LVL.district)).toBeNull();
    expect(ancestorAtLevel(index, null, LVL.district)).toBeNull();
    expect(ancestorAtLevel(index, 'GROUPE_1', null)).toBeNull();
  });

  it('ne boucle pas sur un cycle hérité des données', () => {
    const cyclic = buildIndex([
      ['A', 'B', LVL.groupe],
      ['B', 'A', LVL.district],
    ]);
    expect(ancestorAtLevel(cyclic, 'A', LVL.national)).toBeNull();
    expect(ancestorAtLevel(cyclic, 'A', LVL.district)).toBe('B');
  });
});

describe('evaluateAnchor - règle R8', () => {
  const index = buildIndex();

  describe('cas de référence du cadrage', () => {
    it('responsable NATIONAL qui déménage à l’autre bout de l’arbre → conservée', () => {
      const verdict = evaluateAnchor(index, 'GROUPE_1', 'GROUPE_6', LVL.national);
      expect(verdict.kept).toBe(true);
      expect(verdict.anchor_before).toBe('NATIONAL');
      expect(verdict.anchor_after).toBe('NATIONAL');
    });

    it('responsable CENTRE qui change de chapitre dans le même centre → conservée', () => {
      // GROUPE_1 (CHAPITRE_1) → GROUPE_4 (CHAPITRE_2), tous deux sous CENTRE_X.
      const verdict = evaluateAnchor(index, 'GROUPE_1', 'GROUPE_4', LVL.centre);
      expect(verdict.kept).toBe(true);
      expect(verdict.anchor_before).toBe('CENTRE_X');
      expect(verdict.anchor_after).toBe('CENTRE_X');
    });

    it('responsable CENTRE qui change de centre régional → perdue', () => {
      // GROUPE_1 (CENTRE_X / CR_1) → GROUPE_6 (CENTRE_Z / CR_2).
      const verdict = evaluateAnchor(index, 'GROUPE_1', 'GROUPE_6', LVL.centre);
      expect(verdict.kept).toBe(false);
      expect(verdict.anchor_before).toBe('CENTRE_X');
      expect(verdict.anchor_after).toBe('CENTRE_Z');
    });
  });

  describe('conséquences mécaniques sur les niveaux bas', () => {
    it('responsabilité DISTRICT toujours perdue quand le district change', () => {
      const verdict = evaluateAnchor(index, 'GROUPE_1', 'GROUPE_3', LVL.district);
      expect(verdict.kept).toBe(false);
      expect(verdict.anchor_before).toBe('DISTRICT_1');
      expect(verdict.anchor_after).toBe('DISTRICT_2');
    });

    it('responsabilité CHAPITRE conservée si on reste dans le même chapitre', () => {
      // DISTRICT_1 et DISTRICT_2 sont tous deux sous CHAPITRE_1.
      const verdict = evaluateAnchor(index, 'GROUPE_1', 'GROUPE_3', LVL.chapitre);
      expect(verdict.kept).toBe(true);
      expect(verdict.anchor_after).toBe('CHAPITRE_1');
    });

    it('responsabilité GROUPE perdue même sur un déplacement intra-district', () => {
      // Cas hors workflow (simple édition) : la règle doit s'appliquer là aussi.
      const verdict = evaluateAnchor(index, 'GROUPE_1', 'GROUPE_2', LVL.groupe);
      expect(verdict.kept).toBe(false);
      expect(verdict.anchor_before).toBe('GROUPE_1');
      expect(verdict.anchor_after).toBe('GROUPE_2');
    });

    it('un membre qui ne bouge pas ne perd rien', () => {
      for (const level of Object.values(LVL)) {
        expect(evaluateAnchor(index, 'GROUPE_1', 'GROUPE_1', level).kept).toBe(true);
      }
    });
  });

  describe('ancre indéterminable → conservation par défaut', () => {
    it('responsabilité sans niveau', () => {
      const verdict = evaluateAnchor(index, 'GROUPE_1', 'GROUPE_6', null);
      expect(verdict.undetermined).toBe(true);
      expect(verdict.kept).toBe(true);
    });

    it('niveau absent du chemin hiérarchique de départ', () => {
      const verdict = evaluateAnchor(index, 'GROUPE_1', 'GROUPE_6', LVL.sousGroupe);
      expect(verdict.undetermined).toBe(true);
      expect(verdict.kept).toBe(true);
    });
  });
});

describe('ResponsibilityAnchorService', () => {
  const structures = ROWS.map(([uuid, parent_uuid, level_uuid]) => ({
    uuid,
    parent_uuid,
    level_uuid,
  }));

  const levels = [
    { uuid: LVL.district, name: 'District' },
    { uuid: LVL.centre, name: 'Centre' },
    { uuid: LVL.groupe, name: 'Groupe' },
    // Homonyme de la catégorie « responsibility » : jamais porté par une structure,
    // il ne doit pas être retenu comme niveau d'ancrage.
    { uuid: 'lvl-district-responsabilite', name: 'DISTRICT' },
  ];

  let responsibilityRows: any[];

  const buildService = () => {
    const structureRepository = {
      find: jest.fn().mockResolvedValue(structures),
    } as unknown as Repository<StructureEntity>;

    const levelRepository = {
      find: jest.fn().mockResolvedValue(levels),
    } as unknown as Repository<LevelEntity>;

    const queryBuilder: any = {
      innerJoin: jest.fn(() => queryBuilder),
      leftJoin: jest.fn(() => queryBuilder),
      select: jest.fn(() => queryBuilder),
      where: jest.fn(() => queryBuilder),
      andWhere: jest.fn(() => queryBuilder),
      getRawMany: jest.fn(async () => responsibilityRows),
    };

    const memberResponsibilityRepository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
    } as unknown as Repository<MemberResponsibilityEntity>;

    return new ResponsibilityAnchorService(
      structureRepository,
      levelRepository,
      memberResponsibilityRepository,
    );
  };

  beforeEach(() => {
    responsibilityRows = [];
  });

  it('résout le district d’une structure, et lui-même si c’en est un', async () => {
    const service = buildService();
    await expect(service.resolveDistrict('SOUS_GROUPE_1')).resolves.toBe('DISTRICT_1');
    await expect(service.resolveDistrict('DISTRICT_5')).resolves.toBe('DISTRICT_5');
    await expect(service.resolveDistrict('REGION_A')).resolves.toBeNull();
  });

  it('ignore un niveau homonyme qui n’est porté par aucune structure', async () => {
    const service = buildService();
    await expect(service.resolveLevelUuidByName('DISTRICT')).resolves.toBe(LVL.district);
  });

  it('détecte le franchissement d’une frontière de district (règle R1)', async () => {
    const service = buildService();
    // Même district → édition simple, pas de workflow.
    await expect(
      service.crossesDistrictBoundary('GROUPE_1', 'GROUPE_2'),
    ).resolves.toBe(false);
    // Districts différents → workflow requis.
    await expect(
      service.crossesDistrictBoundary('GROUPE_1', 'GROUPE_3'),
    ).resolves.toBe(true);
  });

  it('répartit les responsabilités d’un membre entre conservées et perdues', async () => {
    responsibilityRows = [
      {
        member_responsibility_uuid: 'mr-1',
        member_uuid: 'membre-1',
        responsibility_uuid: 'resp-centre',
        responsibility_name: 'Responsable de centre',
        level_uuid: LVL.centre,
        level_name: 'Centre',
      },
      {
        member_responsibility_uuid: 'mr-2',
        member_uuid: 'membre-1',
        responsibility_uuid: 'resp-district',
        responsibility_name: 'Responsable de district',
        level_uuid: LVL.district,
        level_name: 'District',
      },
    ];

    const service = buildService();
    // Changement de chapitre à l'intérieur de CENTRE_X : le centre reste, le district saute.
    const impact = await service.computeResponsibilityImpact(
      'membre-1',
      'GROUPE_1',
      'GROUPE_4',
    );

    expect(impact.kept.map((r) => r.responsibility_uuid)).toEqual(['resp-centre']);
    expect(impact.lost.map((r) => r.responsibility_uuid)).toEqual(['resp-district']);
    expect(impact.lost[0].member_responsibility_uuid).toBe('mr-2');
    expect(impact.lost[0].anchor_before).toBe('DISTRICT_1');
    expect(impact.lost[0].anchor_after).toBe('DISTRICT_3');
  });

  it('traite un lot de membres avec une seule lecture de l’arbre', async () => {
    responsibilityRows = [
      {
        member_responsibility_uuid: 'mr-1',
        member_uuid: 'membre-1',
        responsibility_uuid: 'resp-district',
        responsibility_name: 'Responsable de district',
        level_uuid: LVL.district,
        level_name: 'District',
      },
    ];

    const service = buildService();
    const impacts = await service.computeImpact([
      {
        member_uuid: 'membre-1',
        from_structure_uuid: 'GROUPE_1',
        to_structure_uuid: 'GROUPE_6',
      },
      {
        member_uuid: 'membre-2',
        from_structure_uuid: 'GROUPE_1',
        to_structure_uuid: 'GROUPE_6',
      },
    ]);

    expect(impacts).toHaveLength(2);
    expect(impacts[0].lost).toHaveLength(1);
    // Membre sans responsabilité : rien à perdre, rien à conserver.
    expect(impacts[1].lost).toHaveLength(0);
    expect(impacts[1].kept).toHaveLength(0);
  });

  it('ne renvoie aucun impact pour un lot vide', async () => {
    const service = buildService();
    await expect(service.computeImpact([])).resolves.toEqual([]);
  });
});
