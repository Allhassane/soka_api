import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RoleType } from 'src/shared/enums/types.enums';

export class CreateRoleDto {
  @ApiProperty({
    description: 'Nom unique du rôle (ex: admin, user, manager)',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    enum: RoleType,
    description: 'Type du rôle (pedagogic, geographic, school)',
  })
  @IsEnum(RoleType)
  type?: RoleType;

  @ApiProperty({
    description:
      'UUID de la zone associée (En fonction du type, lister ici les zones associées. Si le type est school, alors laisser vide)',
    required: false,
  })
  @IsOptional()
  @IsString()
  zone_uuid?: string;
}
