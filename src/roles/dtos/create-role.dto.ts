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

}
