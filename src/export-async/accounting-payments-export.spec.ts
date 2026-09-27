import { ExportProcessorService } from './export-processor.service';

/**
 * **Le fichier de l'export comptable applique la structure portée par le job** (2026-09-27).
 *
 * Le bouton « Exporter » du bloc de lignes part avec le filtre « Structure » de l'écran ; le job
 * le conserve, et le traitement en arrière-plan doit le réappliquer - par la même fonction que
 * le tableau. Sans ça, le fichier d'une région contiendrait toute l'organisation.
 */

function makeProcessor(params: any, sousArbre: string[] = []) {
  const conditions: { clause: string; params?: any }[] = [];
  const qb: any = {
    leftJoinAndSelect: jest.fn(() => qb),
    where: jest.fn((clause: string, p?: any) => {
      conditions.push({ clause, params: p });
      return qb;
    }),
    andWhere: jest.fn((clause: string, p?: any) => {
      conditions.push({ clause, params: p });
      return qb;
    }),
    orderBy: jest.fn(() => qb),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const exportJobService = {
    updateJobStatus: jest.fn().mockResolvedValue(undefined),
    updateJobProgress: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue({ uuid: 'job-1', params }),
    completeJob: jest.fn().mockResolvedValue(undefined),
  };
  const accessScope = { sousArbre: jest.fn().mockResolvedValue(new Set(sousArbre)) };

  const service = new ExportProcessorService(
    exportJobService as never,
    { createQueryBuilder: jest.fn(() => qb) } as never, // paiements
    {} as never,
    {} as never,
    { find: jest.fn().mockResolvedValue([]) } as never, // membres
    {} as never,
    {} as never,
    {} as never,
    accessScope as never,
  );
  // Rien n'est écrit sur le disque : seul compte ce que la requête filtre.
  jest.spyOn(service as any, 'ecrireClasseur').mockResolvedValue(undefined);

  return { service, conditions, accessScope, exportJobService };
}

describe('processAccountingPaymentsExport - filtre « Structure »', () => {
  it('réapplique la structure du job : sous-arbre complet, par le bénéficiaire', async () => {
    const { service, conditions, accessScope, exportJobService } = makeProcessor(
      {
        type: 'subscription',
        campaign_uuid: 'camp-1',
        bucket: 'paid',
        structure_uuid: 'region-1',
      },
      ['region-1', 'groupe-7'],
    );

    await service.processAccountingPaymentsExport('job-1');

    expect(accessScope.sousArbre).toHaveBeenCalledWith('region-1');
    const filtre = conditions.find((c) => /beneficiary_uuid/.test(c.clause));
    expect(filtre?.params).toEqual({ perimetreStructures: ['region-1', 'groupe-7'] });
    expect(exportJobService.updateJobStatus).not.toHaveBeenCalledWith(
      'job-1',
      'FAILED',
      expect.anything(),
    );
  });

  it('sans structure dans le job : toutes les lignes du seau', async () => {
    const { service, conditions, accessScope } = makeProcessor({
      type: 'subscription',
      bucket: 'paid',
    });

    await service.processAccountingPaymentsExport('job-1');

    expect(accessScope.sousArbre).not.toHaveBeenCalled();
    expect(conditions.some((c) => /beneficiary_uuid/.test(c.clause))).toBe(false);
  });
});
