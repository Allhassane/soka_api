import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStructureDto {
  @ApiProperty({
    description: 'uuid de la structure',
    example: '',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  uuid?: string;

  @ApiProperty({
    description: 'Nom de la structure',
    example: 'Structure Lorem',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la structure est requise' })
  @MaxLength(150)
  name: string;

  @ApiProperty({
    description: 'identifiant de la structure parente',
    example: '',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  parent_uuid?: string | null;

  // @ApiProperty({
  //   description: 'identifiant du niveau',
  //   example: '',
  // })
  // @IsString()
  // @IsNotEmpty({ message: 'Veuillez selectionner un niveau' })
  // @MaxLength(150)
  // level_uuid: string;
}
