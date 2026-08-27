import { ForbiddenException } from '@nestjs/common';
import { AccountingExportService } from './accounting-export.service';
import {
  ExportJobStatus,
  TYPE_EXPORT_COMPTA,
} from '../export-async/entities/export-job.entity';

/**
 * **L'export des lignes d'une carte KPI, lancé depuis la Comptabilité.**
 *
 * Deux propriétés se verrouillent ici :
 * 1. **le job porte le seau et la campagne regardés** - c'est ce qui garantit que le fichier
 *    rend LES lignes de la tuile cliquée, et pas une autre population ;
 * 2. **le cloisonnement, dans l'autre sens** - cette porte ne sert que des jobs comptables et
 *    ne sert qu'à leur propriétaire. Le module Exports refuse déjà les jobs comptables
 *    (`payments/export-download-cloisonnement.spec.ts`) : sans le refus symétrique, cette
 *    route deviendrait le moyen de télécharger n'importe quel export avec la seule
 *    permission Comptabilité.
 */

function makeService(job?: any) {
  const jobsCrees: any[] = [];
  const exportJobService = {
    createJob: jest.fn((type: string, params: any, user_uuid: string) => {
      const cree = { uuid: 'job-1', type, params, user_uuid };
      jobsCrees.push(cree);
      return Promise.resolve(cree);
    }),
    getJob: jest.fn().mockResolvedValue(job ?? null),
  };
  const exportProcessorService = {
    processAccountingPaymentsExport: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AccountingExportService(
    exportJobService as never,
    exportProcessorService as never,
  );
  return { service, exportJobService, exportProcessorService, jobsCrees };
}

describe('AccountingExportService.lancer', () => {
  it('crée un job comptable portant le type, la campagne ET le seau regardés', async () => {
    const { service, jobsCrees } = makeService();

    const rendu = await service.lancer(
      { type: 'subscription', campaign_uuid: 'camp-1', bucket: 'failed' },
      'user-1',
    );

    expect(jobsCrees).toHaveLength(1);
    expect(jobsCrees[0].type).toBe(TYPE_EXPORT_COMPTA);
    expect(jobsCrees[0].params).toMatchObject({
      type: 'subscription',
      campaign_uuid: 'camp-1',
      bucket: 'failed',
    });
    expect(rendu.jobId).toBe('job-1');
  });

  it('retient « all » quand aucun seau n’est demandé - la tuile « Paiement initié »', async () => {
    const { service, jobsCrees } = makeService();

    await service.lancer({ type: 'donation', campaign_uuid: 'camp-2' }, 'user-1');

    expect(jobsCrees[0].params.bucket).toBe('all');
  });

  it('refuse un type inconnu SANS créer de job', async () => {
    const { service, exportJobService } = makeService();

    await expect(
      service.lancer({ type: 'boutique', campaign_uuid: 'camp-1' }, 'user-1'),
    ).rejects.toMatchObject({ response: { data: { code: 'TYPE_INVALIDE' } } });
    expect(exportJobService.createJob).not.toHaveBeenCalled();
  });

  it('refuse un seau inconnu SANS créer de job', async () => {
    const { service, exportJobService } = makeService();

    await expect(
      service.lancer(
        { type: 'subscription', campaign_uuid: 'camp-1', bucket: 'gagnants' },
        'user-1',
      ),
    ).rejects.toMatchObject({ response: { data: { code: 'BUCKET_INVALIDE' } } });
    expect(exportJobService.createJob).not.toHaveBeenCalled();
  });
});

describe('AccountingExportService.telecharger - cloisonnement symétrique', () => {
  const jobCompta = {
    uuid: 'job-1',
    type: TYPE_EXPORT_COMPTA,
    user_uuid: 'user-1',
    status: ExportJobStatus.COMPLETED,
    file_path: 'C:/nexistepas.xlsx',
    file_name: 'compta.xlsx',
  };

  it('refuse un job qui n’est PAS un export comptable', async () => {
    const { service } = makeService({ ...jobCompta, type: 'transactions' });

    await expect(service.telecharger('job-1', 'user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuse le job d’un AUTRE utilisateur', async () => {
    const { service } = makeService({ ...jobCompta, user_uuid: 'user-2' });

    await expect(service.telecharger('job-1', 'user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('laisse passer le job comptable de son propriétaire (il échoue plus loin, sur le fichier)', async () => {
    const { service } = makeService(jobCompta);

    await expect(service.telecharger('job-1', 'user-1')).rejects.not.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('AccountingExportService.statut', () => {
  it('refuse de renseigner sur un job qui n’est pas comptable', async () => {
    const { service } = makeService({
      uuid: 'job-1',
      type: 'members',
      user_uuid: 'user-1',
      status: ExportJobStatus.PROCESSING,
      progress: 40,
    });

    await expect(service.statut('job-1', 'user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rend l’avancement d’un job comptable', async () => {
    const { service } = makeService({
      uuid: 'job-1',
      type: TYPE_EXPORT_COMPTA,
      user_uuid: 'user-1',
      status: ExportJobStatus.PROCESSING,
      progress: 40,
    });

    await expect(service.statut('job-1', 'user-1')).resolves.toMatchObject({
      status: ExportJobStatus.PROCESSING,
      progress: 40,
    });
  });
});
