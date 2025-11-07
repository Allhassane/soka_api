import { IsNotEmpty, IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCommitteeDto {
  @ApiProperty({
    description: 'Nom du comité',
    example: 'Comité 1',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du comité est requise' })
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({
    description: 'Description du comité',
    example: 'Comité pour gérer les activités !',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'Statut du comité',
     example: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
