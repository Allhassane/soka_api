import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ImportReferenceService } from './import-reference.service';
import { MemberEntity } from 'src/members/entities/member.entity';
import { MemberResponsibilityEntity } from 'src/member-responsibility/entities/member-responsibility.entity';
import { ImportFailureEntity } from './entities/import-failure.entity';
import { ImportBatchEntity } from './entities/import-batch.entity';

/**
 * Module d'importation Excel des membres.
 * - Validation du format canonique + parsing.
 * - Dry-run : résolution des référentiels/structure + simulation create/update.
 * - Commit : création/mise à jour réelle + persistance des échecs (import_failures).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MemberEntity,
      MemberResponsibilityEntity,
      ImportFailureEntity,
      ImportBatchEntity,
    ]),
  ],
  controllers: [ImportController],
  providers: [ImportService, ImportReferenceService],
})
export class ImportModule {}
