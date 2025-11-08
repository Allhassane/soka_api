import { IsNotEmpty, IsString, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLevelDto {
  @ApiProperty({ example: 'Region', description: 'Nom du niveau' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 1, description: 'Ordre du niveau' })
  @IsNotEmpty()
  @IsInt()
  order: number;

  @ApiProperty({
    example: 'mixte',
    description: 'Categorie du niveau',
    default: 'mixte',
  })
  @IsNotEmpty()
  @IsString()
  category: 'responsibility' | 'mixte';
}
