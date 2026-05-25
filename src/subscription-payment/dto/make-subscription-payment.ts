import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsNotEmpty,
  IsNumber,
  IsOptional,
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
    description: "Quantité du paiement (généralement 1 pour un don)",
    example: 1,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  quantity?: number;
}
