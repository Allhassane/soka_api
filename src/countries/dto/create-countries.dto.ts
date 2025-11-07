import { IsNotEmpty, IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCountryDto {
  @ApiProperty({
    description: 'libellé',
    example: "Cote d'ivoire",
  })
  @IsString()
  @IsNotEmpty({ message: 'le libellé est requis' })
  @MaxLength(150)
  name: string;  
  
  @IsString()
  @IsOptional()
  @MaxLength(150)
  captial?: string;  
  
  @IsString()
  @IsOptional()
  @MaxLength(150)
  continent?: string;

  @ApiPropertyOptional({
    description: 'Statut',
     example: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
