import { IsNotEmpty, IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateResponsabilityDto {
  @ApiProperty({
    description: 'libellé',
    example: '',
  })
  @IsString()
  @IsNotEmpty({ message: 'le libellé est requis' })
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({
    description: 'Statut',
     example: 'enable',
  })
  @IsString()
  @IsOptional()
  status?: 'enable';
}
