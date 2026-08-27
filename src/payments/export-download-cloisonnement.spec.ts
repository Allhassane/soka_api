import { ForbiddenException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import {
  ExportJobStatus,
  TYPE_EXPORT_COMPTA,
} from '../export-async/entities/export-job.entity';

/**
 * **Cloisonnement des exports comptables : la porte du module Exports leur est fermée.**
 *
 * 🚨 Exclure ces jobs de la LISTE ne suffit pas : la liste ne cache qu'un identifiant, elle ne
 * ferme pas la route. Sans ce refus, quiconque connaît (ou devine) l'uuid d'un job comptable et
 * porte un droit du module Exports téléchargerait le fichier - or ce fichier porte les noms et
 * les TÉLÉPHONES des payeurs et bénéficiaires de toute l'organisation, sans périmètre.
 * Les deux routes se refusent donc mutuellement les jobs de l'autre.
 */

function makeService(job: any) {
  const exportJobService = { getJob: jest.fn().mockResolvedValue(job) };
  // Seul `exportJobService` est sollicité par `downloadTransactionsExport` : les autres
  // dépendances ne sont pas atteintes avant le refus, c'est précisément ce qu'on vérifie.
  const service = new PaymentService(
    undefined as never, undefined as never, undefined as never, undefined as never,
    undefined as never, undefined as never,
    exportJobService as never,
    undefined as never, undefined as never, undefined as never, undefined as never,
    undefined as never, undefined as never,
  );
  return { service, exportJobService };
}

describe('PaymentService.downloadTransactionsExport - le module Exports ne sert pas les exports compta', () => {
  const jobCompta = {
    uuid: 'job-compta',
    type: TYPE_EXPORT_COMPTA,
    user_uuid: 'user-1',
    status: ExportJobStatus.COMPLETED,
    file_path: 'C:/nexistepas.xlsx',
    file_name: 'compta.xlsx',
  };

  it('refuse un job comptable, même TERMINÉ et demandé par son propriétaire', async () => {
    const { service } = makeService(jobCompta);

    await expect(
      service.downloadTransactionsExport('job-compta', 'user-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sert toujours un export de transactions ordinaire (le refus ne déborde pas)', async () => {
    const { service } = makeService({ ...jobCompta, type: 'transactions' });

    // Le fichier n'existe pas sur le disque : on doit donc échouer PLUS LOIN, sur le fichier
    // introuvable, et surtout pas sur le cloisonnement.
    await expect(
      service.downloadTransactionsExport('job-compta', 'user-1'),
    ).rejects.not.toBeInstanceOf(ForbiddenException);
  });
});
