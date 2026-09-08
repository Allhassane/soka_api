import { Repository } from 'typeorm';
import { MemberEntity } from './entities/member.entity';
import { MatriculeService } from './matricule.service';

/**
 * Règle du matricule (`docs/MODULE-MEMBRES.md`).
 *
 * Régression du 2026-09-08 : la règle vivait dans `MemberService.store()` et l'import Excel ne la
 * rejouait pas - 235 membres importés sans matricule, 31 portant le remplissage du tableur. Ces
 * tests verrouillent les trois points qui ont mordu.
 */

/**
 * Faux dépôt : reproduit la seule chaîne de query builder utilisée par le service
 * (`createQueryBuilder().withDeleted().orderBy().getOne()` et `…where().getCount()`).
 */
const fakeRepo = (rows: Array<{ id: number; matricule: string | null }>) => {
  const builder: any = {
    _where: null as string | null,
    withDeleted: () => builder,
    orderBy: () => builder,
    where: (_sql: string, params: { candidate: string }) => {
      builder._where = params.candidate;
      return builder;
    },
    getOne: async () =>
      [...rows].sort((a, b) => b.id - a.id)[0] ?? null,
    getCount: async () =>
      rows.filter((r) => r.matricule === builder._where).length,
  };
  return {
    createQueryBuilder: () => ({ ...builder }),
  } as unknown as Repository<MemberEntity>;
};

describe('MatriculeService.format', () => {
  it('rembourre à 4 chiffres', () => {
    expect(MatriculeService.format(2026, 7)).toBe('26-0007');
    expect(MatriculeService.format(2026, 7953)).toBe('26-7953');
  });

  it("ne tronque pas au-delà de 9999 - le format s'élargit", () => {
    // `padStart(4)` d'origine produisait déjà `26-10000` ; ce test fige le comportement pour que
    // personne ne « corrige » l'élargissement en tronquant. La base comptait 8 270 membres au
    // 2026-09-08 : le cas est à ~1 700 créations, pas dans un futur lointain.
    expect(MatriculeService.format(2026, 10000)).toBe('26-10000');
    expect(MatriculeService.format(2026, 12345)).toBe('26-12345');
  });
});

describe('MatriculeService.isPlausible', () => {
  it('accepte le format canonique et la numérotation héritée', () => {
    expect(MatriculeService.isPlausible('26-7953')).toBe(true);
    expect(MatriculeService.isPlausible('26-10000')).toBe(true);
    // 24 fiches en base portent ce format : de vrais identifiants de l'ancien système.
    expect(MatriculeService.isPlausible('0007283')).toBe(true);
  });

  it('refuse le remplissage de tableur relevé en base', () => {
    expect(MatriculeService.isPlausible('')).toBe(false);
    expect(MatriculeService.isPlausible(null)).toBe(false);
    expect(MatriculeService.isPlausible('   ')).toBe(false);
    expect(MatriculeService.isPlausible('sss')).toBe(false);
    expect(MatriculeService.isPlausible('XXXXX')).toBe(false);
    expect(MatriculeService.isPlausible('Nouveau membre ou non digitalisé')).toBe(false);
    // Numéros de ligne du tableur : 18 fiches en base en portent un. Les accepter ferait
    // collisionner deux fichiers importés dès la première ligne.
    expect(MatriculeService.isPlausible('1')).toBe(false);
    expect(MatriculeService.isPlausible('18')).toBe(false);
  });
});

describe('MatriculeService.generate', () => {
  const anneeCourante = new Date().getFullYear().toString().slice(-2);

  it('part de MAX(id) + 1', async () => {
    const service = new MatriculeService(
      fakeRepo([
        { id: 10, matricule: 'peu importe' },
        { id: 42, matricule: 'peu importe' },
      ]),
    );
    expect(await service.generate()).toBe(`${anneeCourante}-0043`);
  });

  it('saute un numéro déjà pris', async () => {
    // Les matricules hérités ne suivent pas les `id` : le candidat issu de MAX(id)+1 peut être
    // occupé. Sans ce décalage, `UQ_members_matricule` ferait échouer la création du membre.
    const service = new MatriculeService(
      fakeRepo([
        { id: 42, matricule: `${anneeCourante}-0043` },
        { id: 12, matricule: `${anneeCourante}-0044` },
      ]),
    );
    expect(await service.generate()).toBe(`${anneeCourante}-0045`);
  });

  it('démarre à 1 sur une base vide', async () => {
    const service = new MatriculeService(fakeRepo([]));
    expect(await service.generate()).toBe(`${anneeCourante}-0001`);
  });
});
