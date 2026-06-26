import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { NotificationChannel } from '../entities/journal-distribution.entity';

export class DistributeEditionDto {
  @ApiPropertyOptional({
    description:
      'Liste des UUIDs de zones à servir. Si vide, toutes les zones ayant un besoin (abonnés rattachés) sont distribuées.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  zone_uuids?: string[];

  @ApiPropertyOptional({
    description: 'Canal d’envoi des alertes',
    enum: NotificationChannel,
    default: NotificationChannel.SMS,
  })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({
    description: 'Modèle de message - placeholders {correspondent} {edition} {quantity} {deadline}',
  })
  @IsOptional()
  @IsString()
  message_template?: string;
}

export class AckDeliveryDto {
  @ApiProperty({ description: 'Quantité réellement livrée', example: 150 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  delivered_quantity: number;

  @ApiPropertyOptional({ description: 'Commentaire éventuel' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class SweepDistributionsDto {
  @ApiPropertyOptional({
    description:
      "UUID de l'édition à balayer. Si absent, toutes les éditions non livrées sont traitées.",
  })
  @IsOptional()
  @IsUUID()
  edition_uuid?: string;
}
