import { IsOptional, IsString, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDivisionDto {
  @ApiProperty({
    description: 'Département uuid',
    example: 'Département Homme',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  department_uuid?: string;

  @ApiPropertyOptional({
    description: 'Nom de la division',
    example: 'Administration',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description: 'Genre',
    example: 'homme',
  })
  @IsString()
  @IsOptional({ message: 'le genre est requis' })
  gender?: 'mixte' | 'homme' | 'femme';

  @ApiPropertyOptional({
    description: 'Description de la division',
    example: 'division pour gérer les utilisateurs',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'Statut de la division',
    example: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
