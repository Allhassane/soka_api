import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsUUID,
  IsInt,
  Min,
} from 'class-validator';

export enum PaymentSource {
  DONATION = 'donation',
  SUBSCRIPTION = 'subscription',
  SHOP_ITEM = 'shop_item',
}

export class CreatePaymentDto {

  @ApiProperty({
    description: 'Origine du paiement (don, abonnement, boutique)',
    example: 'donation',
    enum: PaymentSource,
  })
  @IsEnum(PaymentSource, { message: 'La source du paiement est invalide' })
  source: PaymentSource;

  @ApiProperty({
    description: 'UUID de la source (campagne de don, abonnement, produit)',
    example: 'a12f56b1-4cce-4c8c-8a61-90d3df004f00',
  })
  @IsUUID()
  @IsNotEmpty({ message: 'source_uuid est requis' })
  source_uuid: string;


  @ApiProperty({
    description: 'UUID du bénéficiaire du paiement',
    example: 'c551b9bb-1bee-4dc0-a662-1fcf8ebdb222',
  })
  @IsUUID()
  @IsNotEmpty()
  beneficiary_uuid: string;

  @ApiProperty({
    description: 'Nom du bénéficiaire',
    example: 'KONAN Rodrigue',
  })
  @IsString()
  @IsNotEmpty()
  beneficiary_name: string;


  @ApiProperty({
    description: "UUID de la personne ayant effectué l'action",
    example: 'd77b6f19-9c72-4db7-921d-ecf2c934dfa1',
  })
  @IsUUID()
  @IsNotEmpty()
  actor_uuid: string;

  @ApiProperty({
    description: "Nom de l'acteur ayant effectué le paiement",
    example: 'N’GUESSAN Mireille',
  })
  @IsString()
  @IsNotEmpty()
  actor_name: string;


  @ApiPropertyOptional({
    description: 'Montant unitaire (don libre ou prix du produit ou montant abonnement)',
    example: 5000,
  })
  @IsNumber({}, { message: 'amount doit être un nombre' })
  @Min(0, { message: 'Le montant doit être positif' })
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({
    description: 'Quantité payée (utilisée pour abonnement ou boutique)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;
}
