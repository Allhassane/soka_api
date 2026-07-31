import { Module } from '@nestjs/common';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { ReferentialMergeService } from './referential-merge.service';

/**
 * Reversement d'un élément de référentiel vers un autre.
 *
 * Module ordinaire et non `@Global` : il n'a que trois consommateurs (Formations, Métiers,
 * Localités de résidence), et l'import explicite dit lesquels. Le service ne dépend que de la
 * `DataSource` et de la journalisation.
 */
@Module({
  imports: [LogActivitiesModule],
  providers: [ReferentialMergeService],
  exports: [ReferentialMergeService],
})
export class ReferentialMergeModule {}
