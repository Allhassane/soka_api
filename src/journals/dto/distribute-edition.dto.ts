import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { NotificationChannel } from '../entities/journal-distribution.entity';

export class DistributeEditionDto {
  @ApiPropertyOptional({
    description:
      'Liste des UUIDs de destinations à inclure dans la distribution. Si vide, toutes les destinations actives sont utilisées.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  destination_uuids?: string[];

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
  delivered_quantity: number;

  @ApiPropertyOptional({ description: 'Commentaire éventuel' })
  @IsOptional()
  @IsString()
  comment?: string;
}
