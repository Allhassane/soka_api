import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateResponsibilityDto {
  @ApiProperty({
    description: 'libellé',
    example: '',
  })
  @IsString()
  @IsNotEmpty({ message: 'le libellé est requis' })
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({
    description: 'Identifiant du niveau',
  })
  @IsString()
  @IsNotEmpty({ message: 'le niveau est requis' })
  level_uuid: string;

  @ApiPropertyOptional({
    description: 'Genre',
    example: 'homme',
  })
  @IsString()
  @IsNotEmpty({ message: 'le genre est requis' })
  gender: 'mixte' | 'homme' | 'femme';

  @ApiPropertyOptional({
    description: 'Statut',
    example: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
