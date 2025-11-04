import { IsNotEmpty, IsString, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLevelDto {
  @ApiProperty({ example: 'Première', description: 'Nom du niveau' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 1, description: 'Ordre du niveau' })
  @IsNotEmpty()
  @IsInt()
  order: number;

  @ApiProperty({
    example: 'geographic',
    description: 'Categorie du niveau',
    default: 'geographic',
  })
  @IsNotEmpty()
  @IsString()
  category: 'geographic' | 'pedagogic';
}
