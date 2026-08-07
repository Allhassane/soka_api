import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsUUID,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class MakeSubscriptionPaymentDto {
  @ApiProperty({
    description: "UUID de la campagne d'abonnement ciblée",
    example: "a12f56b1-4cce-4c8c-8a61-90d3df004f00",
  })
  @IsUUID()
  @IsNotEmpty({ message: "Le champ 'subscription_uuid' est requis." })
  subscription_uuid: string;

  @ApiProperty({
    description: "UUID du bénéficiaire du don",
    example: "c551b9bb-1bee-4dc0-a662-1fcf8ebdb222",
  })
  @IsUUID()
  @IsNotEmpty({ message: "Le bénéficiaire est requis." })
  beneficiary_uuid: string;

  @ApiPropertyOptional({
    description: 'Numéro de téléphone utilisé pour le paiement (guichet Hub)',
    example: '+2250700000000',
  })
  @IsString()
  @IsOptional()
  paymentNumber?: string;

  @ApiPropertyOptional({
    description: "Quantité du paiement (généralement 1 pour un don)",
    example: 1,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({
    description:
      "Referme les tentatives de paiement encore en cours pour ce bénéficiaire avant "
      + "d'en engager une nouvelle. À n'envoyer qu'après un refus 409 `PENDING_ATTEMPT` "
      + "portant `can_cancel: true`, et sur confirmation explicite du membre.",
    example: true,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  /**
   * ⚠️ **Jamais de valeur par défaut à `true`, et jamais d'annulation implicite.** Une
   * tentative « en cours » peut être un paiement en train d'aboutir : la refermer d'office
   * ferait perdre au membre un règlement qu'il vient de valider chez son opérateur. Le
   * drapeau n'existe que pour transporter un « oui » que le membre a réellement donné.
   * ⚠️ Il ne contourne pas le seuil d'abandon : une tentative de moins de 15 minutes est
   * refusée même avec ce drapeau (cf. `PendingAttemptService`).
   */
  cancel_pending?: boolean;
}
