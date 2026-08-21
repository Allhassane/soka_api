import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { AGE_BUCKETS, ANCIENNETE_BUCKETS } from '../statistics.helpers';

const CLES_AGE = [...AGE_BUCKETS.map((b) => b.cle), 'non_renseigne'];
const CLES_ANCIENNETE = ANCIENNETE_BUCKETS.map((b) => b.cle);

/**
 * Filtres communs à TOUS les écrans de statistiques membres.
 *
 * ⚠️ Il n'y a **pas** de filtre de périmètre : la portée vient du JWT, jamais de l'appelant.
 * Accepter un « voir la structure X » depuis la requête, c'est rouvrir la fuite de juillet
 * 2025 (il suffisait de changer l'uuid dans l'URL pour lire tout l'arbre). `structure_uuid`
 * ci-dessous **restreint** à l'intérieur du périmètre, il ne l'élargit jamais : les deux
 * conditions se cumulent en SQL.
 */
export class MemberFiltersDto {
  @ApiPropertyOptional({ description: 'Restreint au sous-arbre de cette structure' })
  @IsOptional()
  @IsString()
  structure_uuid?: string;

  @ApiPropertyOptional({ description: 'Département (HOMME / FEMME / JEUNESSE)' })
  @IsOptional()
  @IsString()
  department_uuid?: string;

  @ApiPropertyOptional({
    description: "Division, ou « non_renseignee » pour isoler ceux qui n'en ont pas",
  })
  @IsOptional()
  @IsString()
  division_uuid?: string;

  @ApiPropertyOptional({ enum: ['homme', 'femme'] })
  @IsOptional()
  @IsIn(['homme', 'femme'])
  gender?: string;

  @ApiPropertyOptional({ enum: CLES_AGE })
  @IsOptional()
  @IsIn(CLES_AGE)
  age_bucket?: string;

  @ApiPropertyOptional({ enum: CLES_ANCIENNETE })
  @IsOptional()
  @IsIn(CLES_ANCIENNETE)
  seniority_bucket?: string;

  @ApiPropertyOptional({
    description: "Adhésions à partir de cette date (AAAA-MM-JJ). Porte sur membership_date.",
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from doit être au format AAAA-MM-JJ' })
  from?: string;

  @ApiPropertyOptional({ description: "Adhésions jusqu'à cette date (AAAA-MM-JJ)" })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to doit être au format AAAA-MM-JJ' })
  to?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  has_gohonzon?: string;

  @ApiPropertyOptional({
    enum: ['connected', 'never', 'sent_not_connected', 'default_password', 'no_account'],
    description:
      'État du compte de connexion. « sent_not_connected » = a reçu un mot de passe et n’est jamais entré.',
  })
  @IsOptional()
  @IsIn(['connected', 'never', 'sent_not_connected', 'default_password', 'no_account'])
  account_status?: string;

  @ApiPropertyOptional({ enum: ['with', 'without'] })
  @IsOptional()
  @IsIn(['with', 'without'])
  responsibility?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marital_status_uuid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country_uuid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city_uuid?: string;
}
