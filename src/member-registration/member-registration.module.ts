import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LevelEntity } from 'src/level/entities/level.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { MemberResponsibilityEntity } from 'src/member-responsibility/entities/member-responsibility.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { MemberModule } from 'src/members/member.module';
import { MemberTransferModule } from 'src/member-transfer/member-transfer.module';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { User } from 'src/users/entities/user.entity';
import { MemberRegistrationEntity } from './entities/member-registration.entity';
import { MemberRegistrationController } from './member-registration.controller';
import { MemberRegistrationService } from './member-registration.service';
import { RegistrationAuthorityService } from './registration-authority.service';

/**
 * Validation à deux niveaux des enregistrements de membres - cf. `docs/VALIDATION-MEMBRES.md`.
 *
 * `MemberTransferModule` est importé pour son `ResponsibilityAnchorService` : la remontée
 * d'ancêtres est **déjà écrite et testée**, la réécrire ici ferait diverger deux copies de la
 * même règle.
 *
 * ⚠️ **Cycle assumé avec `MemberModule`** (`forwardRef` des deux côtés) : le dépôt part de
 * `POST /members` (donc de `MemberController`) et la validation appelle `MemberService.store()`.
 * C'est le prix de garder **une seule porte d'entrée** pour la création d'un membre - sans quoi
 * il existerait deux chemins, dont un qui contourne le circuit.
 *
 * `RegistrationAuthorityService` est exporté : il porte les règles R4/R5/R5b et peut servir à
 * l'affichage (savoir si un niveau est vacant).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MemberRegistrationEntity,
      MemberEntity,
      MemberResponsibilityEntity,
      StructureEntity,
      LevelEntity,
      User,
    ]),
    MemberTransferModule,
    LogActivitiesModule,
    forwardRef(() => MemberModule),
  ],
  controllers: [MemberRegistrationController],
  providers: [MemberRegistrationService, RegistrationAuthorityService],
  exports: [MemberRegistrationService, RegistrationAuthorityService],
})
export class MemberRegistrationModule {}
