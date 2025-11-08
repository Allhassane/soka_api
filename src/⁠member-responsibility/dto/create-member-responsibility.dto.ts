import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMemberResponsibilityDto {
  @ApiProperty({
    description: 'identifiant de la structure parente',
    example: '',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  member_uuid?: string;

  @ApiProperty({
    description: 'identifiant du niveau',
    example: '',
  })
  @IsString()
  @IsNotEmpty({ message: 'Veuillez selectionner un niveau' })
  @MaxLength(150)
  responsibility_uuid: string;
}
