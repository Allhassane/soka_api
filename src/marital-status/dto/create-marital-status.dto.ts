import { IsNotEmpty, IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMaritalStatusDto {
  @ApiProperty({
    description: 'libellé de la situation matrimonial',
    example: 'Marié',
  })
  @IsString()
  @IsNotEmpty({ message: 'le libellé est requis' })
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({
    description: 'Statut de la situation matrimoniale',
     example: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
