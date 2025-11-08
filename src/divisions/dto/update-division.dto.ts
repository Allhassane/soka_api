import { IsOptional, IsString, MaxLength, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDivisionDto {
    
  @ApiProperty({
    description: 'Département uuid',
    example: 'Département Homme',
  })
  @IsString()
  @IsNotEmpty({ message: 'uuid du département est requise' })
  @MaxLength(150)
  department_uuid: string;

  @ApiPropertyOptional({
    description: 'Nom de la division',
    example: 'Administration',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

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
  statut?: 'enable';
}
