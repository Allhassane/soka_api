import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LevelEntity } from 'src/level/entities/level.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { MemberResponsibilityEntity } from 'src/member-responsibility/entities/member-responsibility.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { MemberTransferItemEntity } from './entities/member-transfer-item.entity';
import { MemberTransferEntity } from './entities/member-transfer.entity';
import { MemberTransferController } from './member-transfer.controller';
import { MemberTransferService } from './member-transfer.service';
import { ResponsibilityAnchorService } from './responsibility-anchor.service';

/**
 * Transfert de membres entre structures - cf. `docs/TRANSFERT-MEMBRES.md`.
 *
 * `ResponsibilityAnchorService` (règle R8) est **exporté** : il devra aussi être consommé par
 * `MemberModule` (`PUT /members/:uuid`, étape 5), pour que tous les chemins qui modifient
 * `structure_uuid` appliquent la même règle.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MemberTransferEntity,
      MemberTransferItemEntity,
      MemberEntity,
      MemberResponsibilityEntity,
      StructureEntity,
      LevelEntity,
    ]),
    LogActivitiesModule,
  ],
  controllers: [MemberTransferController],
  providers: [MemberTransferService, ResponsibilityAnchorService],
  exports: [ResponsibilityAnchorService],
})
export class MemberTransferModule {}
