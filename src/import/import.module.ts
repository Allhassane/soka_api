import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ImportReferenceService } from './import-reference.service';
import { MemberEntity } from 'src/members/entities/member.entity';
import { MemberResponsibilityEntity } from 'src/member-responsibility/entities/member-responsibility.entity';
import { ImportFailureEntity } from './entities/import-failure.entity';
import { ImportBatchEntity } from './entities/import-batch.entity';
import { UserModule } from 'src/users/user.module';
import { MatriculeModule } from 'src/members/matricule.module';

/**
 * Module d'importation Excel des membres.
 * - Validation du format canonique + parsing.
 * - Dry-run : résolution des référentiels/structure + simulation create/update.
 * - Commit : création/mise à jour réelle + compte de connexion + persistance des échecs.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MemberEntity,
      MemberResponsibilityEntity,
      ImportFailureEntity,
      ImportBatchEntity,
    ]),
    // Pour `MemberAccountService` : un membre importé sans compte ne peut pas se connecter.
    UserModule,
    // Pour `MatriculeService` : un membre importé sans matricule n'est identifiable nulle part.
    // Module minuscule exprès - tirer `MembersModule` ici créerait un cycle.
    MatriculeModule,
  ],
  controllers: [ImportController],
  providers: [ImportService, ImportReferenceService],
})
export class ImportModule {}
