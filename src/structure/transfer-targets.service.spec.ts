import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { LevelEntity } from 'src/level/entities/level.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { StructureEntity } from './entities/structure.entity';
import { StructureService } from './structure.service';

/**
 * Cascade de destination d'un transfert (`GET /structure/transfer-targets`).
 *
 * Régression du 2026-09-08 : cet écran passait par `/structure/childrens`, bornée au périmètre
 * de l'appelant (`assertStructureNavigable` : sous-arbre + chaîne d'ancêtres). Or la cible d'un
 * transfert est par construction HORS périmètre - `MemberTransferService.create` ne contrôle que
 * le district source (R2), le district cible relevant de l'approbateur (R3). Résultat : les menus
 * se vidaient dès « Centre régional » pour tout non-administrateur, et seul l'admin voyait
 * l'écran fonctionner.
 *
 * Ce que ces tests verrouillent :
 *  - la cascade descend une branche SANS lien avec l'appelant (c'est tout l'objet de la route) ;
 *  - elle s'arrête au district : groupes et sous-groupes restent le choix de l'approbateur.
 */

const LVL = {
  national: { uuid: 'lvl-national', name: 'NATIONAL', order: 0 },
  region: { uuid: 'lvl-region', name: 'REGION', order: 1 },
  centreRegional: { uuid: 'lvl-cr', name: 'CENTRE_REGIONAL', order: 2 },
  centre: { uuid: 'lvl-centre', name: 'CENTRE', order: 3 },
  chapitre: { uuid: 'lvl-chapitre', name: 'CHAPITRE', order: 4 },
  district: { uuid: 'lvl-district', name: 'DISTRICT', order: 5 },
  groupe: { uuid: 'lvl-groupe', name: 'GROUPE', order: 6 },
};

/**
 *  NATIONAL
 *  ├── REGION_A ─── CR_1 ─── CENTRE_X ─── CHAPITRE_1 ─── DISTRICT_1 ─── GROUPE_1
 *  └── REGION_B ─── CR_2
 */
const ROWS: Array<[string, string | null, { uuid: string }]> = [
  ['NATIONAL', null, LVL.national],
  ['REGION_A', 'NATIONAL', LVL.region],
  ['REGION_B', 'NATIONAL', LVL.region],
  ['CR_1', 'REGION_A', LVL.centreRegional],
  ['CR_2', 'REGION_B', LVL.centreRegional],
  ['CENTRE_X', 'CR_1', LVL.centre],
  ['CHAPITRE_1', 'CENTRE_X', LVL.chapitre],
  ['DISTRICT_1', 'CHAPITRE_1', LVL.district],
  ['GROUPE_1', 'DISTRICT_1', LVL.groupe],
];

const STRUCTURES = ROWS.map(([uuid, parent_uuid, level]) => ({
  uuid,
  name: uuid,
  parent_uuid,
  level_uuid: level.uuid,
})) as StructureEntity[];

const LEVELS = Object.values(LVL) as LevelEntity[];

const structureRepo = {
  findOne: async ({ where }: any) => {
    if ('parent_uuid' in where && where.parent_uuid?.constructor?.name === 'FindOperator') {
      return STRUCTURES.find((s) => s.parent_uuid === null) ?? null;
    }
    return STRUCTURES.find((s) => s.uuid === where.uuid) ?? null;
  },
  find: async ({ where }: any) =>
    STRUCTURES.filter((s) => s.parent_uuid === where.parent_uuid),
} as unknown as Repository<StructureEntity>;

const levelRepo = {
  findOne: async ({ where }: any) =>
    LEVELS.find((l) =>
      where.name ? l.name === where.name : l.uuid === where.uuid,
    ) ?? null,
} as unknown as Repository<LevelEntity>;

const service = new StructureService(
  structureRepo,
  {} as unknown as Repository<MemberEntity>,
  levelRepo,
  {} as any,
  {} as any,
);

const names = (r: { childrens: StructureEntity[] }) =>
  r.childrens.map((c) => c.name).sort();

describe('StructureService.findTransferTargetChildrens', () => {
  it('sans uuid, renvoie les régions (enfants du national)', async () => {
    const result: any = await service.findTransferTargetChildrens(undefined);
    expect(names(result)).toEqual(['REGION_A', 'REGION_B']);
  });

  it("descend une branche quelconque, sans notion de périmètre de l'appelant", async () => {
    // Le cœur de la régression : un initiateur ancré sur DISTRICT_1 (branche REGION_A) doit
    // pouvoir viser REGION_B. `/structure/childrens` répondait 403 ici.
    expect(names(await service.findTransferTargetChildrens('REGION_B') as any)).toEqual(['CR_2']);
    expect(names(await service.findTransferTargetChildrens('REGION_A') as any)).toEqual(['CR_1']);
    expect(names(await service.findTransferTargetChildrens('CR_1') as any)).toEqual(['CENTRE_X']);
    expect(names(await service.findTransferTargetChildrens('CENTRE_X') as any)).toEqual(['CHAPITRE_1']);
    expect(names(await service.findTransferTargetChildrens('CHAPITRE_1') as any)).toEqual(['DISTRICT_1']);
  });

  it("s'arrête au district : les groupes relèvent de l'approbateur", async () => {
    await expect(
      service.findTransferTargetChildrens('DISTRICT_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
