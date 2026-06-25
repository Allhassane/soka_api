import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Création d'un checkout SOKA Pay (session OU lien de paiement).
 * `mode` par défaut = `link` (partageable). Pour un lien à montant libre,
 * laisser `amount` vide ; pour une session, `amount` est requis.
 */
export class CreateCheckoutDto {
  @ApiPropertyOptional({ enum: ['link', 'session'], default: 'link' })
  @IsOptional()
  @IsIn(['link', 'session'])
  mode?: 'link' | 'session';

  @ApiPropertyOptional({ description: 'Montant en plus petite unité (XOF entier). Vide = montant libre (lien).' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  amount?: number;

  @ApiProperty({ description: 'Titre affiché (cotisation, don…).' })
  @IsString()
  @MaxLength(140)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'UUID du membre cotisant.' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  memberUuid?: string;

  @ApiPropertyOptional({ description: 'UUID de la campagne d’abonnement.' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  subscriptionUuid?: string;

  @ApiPropertyOptional({ description: 'UUID de la cotisation interne à marquer réglée au succès.' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  subscriptionPaymentUuid?: string;

  @ApiPropertyOptional({ description: 'Référence libre (echo dans le webhook).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({ default: 'XOF' })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  successUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cancelUrl?: string;

  @ApiPropertyOptional({ description: 'Lien réutilisable (multi-paiements). Défaut : usage unique.' })
  @IsOptional()
  @IsBoolean()
  reusable?: boolean;
}
