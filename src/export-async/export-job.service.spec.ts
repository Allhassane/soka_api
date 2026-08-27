import { ExportJobService } from './export-job.service';
import { TYPE_EXPORT_COMPTA } from './entities/export-job.entity';

/**
 * **Le module Exports ne montre jamais les exports de la Comptabilité.**
 *
 * 🚨 L'export lancé depuis le module Comptabilité est réservé à ce module (décision produit du
 * 2026-08-26). L'exclusion est posée ICI, dans la requête de la liste, et non dans l'appelant :
 * un filtre optionnel qu'il faut penser à passer finit toujours par manquer quelque part, alors
 * qu'une condition posée dans la requête vaut pour tous les appelants, présents et futurs.
 */

/** Simulacre de QueryBuilder qui RETIENT ses conditions, pour les inspecter. */
function fauxQueryBuilder() {
  const clauses: string[] = [];
  const qb: any = {
    clauses,
    where: jest.fn((c: string) => { clauses.push(c); return qb; }),
    andWhere: jest.fn((c: string) => { clauses.push(c); return qb; }),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  return qb;
}

function makeService() {
  const qb = fauxQueryBuilder();
  const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
  return { service: new ExportJobService(repo as never), qb };
}

describe('ExportJobService.getUserJobs - les exports de la Comptabilité restent invisibles', () => {
  it('exclut le type comptable même quand AUCUN filtre n’est passé', async () => {
    const { service, qb } = makeService();

    await service.getUserJobs('user-1');

    const exclusion = qb.clauses.find((c: string) => c.includes('job.type !='));
    expect(exclusion).toBeDefined();
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('job.type !='), {
      typeCompta: TYPE_EXPORT_COMPTA,
    });
  });

  it('exclut le type comptable même quand on le demande EXPLICITEMENT', async () => {
    const { service, qb } = makeService();

    await service.getUserJobs('user-1', 1, 20, { type: TYPE_EXPORT_COMPTA });

    // La demande est bien passée…
    expect(qb.andWhere).toHaveBeenCalledWith('job.type = :type', {
      type: TYPE_EXPORT_COMPTA,
    });
    // …mais l'exclusion la neutralise : la liste ne peut pas rendre ces jobs.
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('job.type !='), {
      typeCompta: TYPE_EXPORT_COMPTA,
    });
  });
});
