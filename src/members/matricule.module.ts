import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemberEntity } from './entities/member.entity';
import { MatriculeService } from './matricule.service';

/**
 * Module volontairement minuscule : il ne dépend que du dépôt `members`.
 *
 * C'est ce qui permet à `ImportModule` de consommer la règle **sans tirer `MembersModule`**,
 * lequel traîne des `forwardRef` (validation, transfert) et introduirait un cycle. Même
 * raisonnement que `MemberAccountService`, hébergé dans `UserModule` pour la même raison.
 */
@Module({
  imports: [TypeOrmModule.forFeature([MemberEntity])],
  providers: [MatriculeService],
  exports: [MatriculeService],
})
export class MatriculeModule {}
