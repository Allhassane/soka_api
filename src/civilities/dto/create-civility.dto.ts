import { IsNotEmpty, IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCivilityDto {
  @ApiProperty({
    description: 'libellé',
    example: 'Monsieur',
  })
  @IsString()
  @IsNotEmpty({ message: 'le libellé est requis' })
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({
    description: 'Sigle',
    example: 'M',
  })
  @IsString()
  @IsOptional()
  @MaxLength(91)
  sigle?: string;  
  
  @ApiProperty({
    example: 'homme',
    description: 'Genre',
    default: 'homme',
  })
  @IsNotEmpty()
  @IsString()
  gender: 'homme' | 'femme' | 'mixte';

  @ApiPropertyOptional({
    description: 'Statut',
     example: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
