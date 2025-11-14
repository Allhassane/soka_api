import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMemberResponsibilityDto {
  @ApiProperty({
    description: 'identifiant du membre',
    example: '',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  member_uuid?: string;

  @ApiProperty({
    description: 'identifiant de la responsabilité',
    example: '',
  })
  @IsString()
  @IsNotEmpty({ message: 'Veuillez selectionner une responsabilité' })
  @MaxLength(150)
  responsibility_uuid: string;

  @ApiProperty({
    description: 'priorité',
    example: '',
  })
  @IsString()
  @IsNotEmpty({ message: 'Veuillez selectionner une priorité' })
  @MaxLength(150)
  priority: 'hight' | 'low';
}
