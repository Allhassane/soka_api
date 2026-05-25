import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCountryDto {
  @ApiPropertyOptional({
    description: 'Libellé ',
    example: "Cote d'ivoire",
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

    
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
