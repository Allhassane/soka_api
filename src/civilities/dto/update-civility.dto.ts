import { IsOptional, IsString, MaxLength, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCivilityDto {
  @ApiPropertyOptional({
    description: 'Libellé ',
    example: 'Madame',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description: 'Sigle',
    example: 'Mme',
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
