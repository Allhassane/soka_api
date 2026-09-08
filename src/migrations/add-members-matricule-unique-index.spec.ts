import { QueryRunner } from 'typeorm';
import { AddMembersMatriculeUniqueIndex1783700000000 } from './1783700000000-AddMembersMatriculeUniqueIndex';

/**
 * Garde-fou de `UQ_members_matricule`.
 *
 * La base locale a été rattrapée avant la pose de l'index ; **la production ne l'est pas**. Le
 * comportement qui compte est donc celui qu'on ne peut pas observer ici : le refus propre quand
 * des doublons subsistent. Le vérifier en base exigerait d'écrire des doublons exprès - ces tests
 * pilotent un faux `QueryRunner` à la place.
 */

/** Faux `QueryRunner` : rend des réponses scriptées et enregistre le SQL exécuté. */
const fakeRunner = (reponses: {
  indexExiste: boolean;
  doublons: Array<{ matricule: string; n: number }>;
}) => {
  const executees: string[] = [];
  const qr = {
    query: async (sql: string) => {
      executees.push(sql);
      if (sql.includes('information_schema.statistics')) {
        return reponses.indexExiste ? [{ 1: 1 }] : [];
      }
      if (sql.includes('HAVING COUNT(*) > 1')) {
        return reponses.doublons;
      }
      return [];
    },
  } as unknown as QueryRunner;
  return { qr, executees };
};

const aCreeLIndex = (executees: string[]) =>
  executees.some((s) => s.includes('CREATE UNIQUE INDEX'));

describe('AddMembersMatriculeUniqueIndex.up', () => {
  const migration = new AddMembersMatriculeUniqueIndex1783700000000();

  it('pose l’index quand aucun matricule n’est en doublon', async () => {
    const { qr, executees } = fakeRunner({ indexExiste: false, doublons: [] });
    await migration.up(qr);
    expect(aCreeLIndex(executees)).toBe(true);
  });

  it('REFUSE et nomme le rattrapage quand des doublons subsistent', async () => {
    // Les 10 fiches réelles qui bloquaient : une note de saisie mise à la place du matricule.
    const { qr, executees } = fakeRunner({
      indexExiste: false,
      doublons: [
        { matricule: 'Nouveau membre ou non digitalisé', n: 8 },
        { matricule: "Ancien membre venu d'autre centre", n: 2 },
      ],
    });

    await expect(migration.up(qr)).rejects.toThrow(
      /seed:fix-missing-matricule/,
    );
    // Le point qui compte : on n'a RIEN posé. Un index simple de repli porterait un nom `UQ_`
    // mensonger, et la contrainte différerait d'un environnement à l'autre.
    expect(aCreeLIndex(executees)).toBe(false);
  });

  it("cite les valeurs fautives, pour qu'on sache quoi arbitrer", async () => {
    const { qr } = fakeRunner({
      indexExiste: false,
      doublons: [{ matricule: 'Nouveau membre ou non digitalisé', n: 8 }],
    });
    await expect(migration.up(qr)).rejects.toThrow(
      /Nouveau membre ou non digitalisé.*×8/,
    );
  });

  it('est idempotente : ne refait rien si l’index existe déjà', async () => {
    const { qr, executees } = fakeRunner({ indexExiste: true, doublons: [] });
    await migration.up(qr);
    expect(aCreeLIndex(executees)).toBe(false);
    // Et surtout : elle ne relance pas le contrôle de doublons, qui refuserait à tort une base
    // déjà protégée par l'index.
    expect(executees.some((s) => s.includes('HAVING COUNT(*) > 1'))).toBe(false);
  });
});
