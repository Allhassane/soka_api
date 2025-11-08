import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDivisionDto {
  @ApiProperty({
    description: 'Département uuid',
    example: 'Département Homme',
  })
  @IsString()
  @IsNotEmpty({ message: 'uuid du département est requise' })
  @MaxLength(150)
  department_uuid: string;

  @ApiProperty({
    description: 'Nom de la division',
    example: 'Division Afrix',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la division est requise' })
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({
    description: 'Description de la division',
    example: 'Division pour gérer les activités !',
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
