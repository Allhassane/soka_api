import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsBoolean } from 'class-validator';

export class CreateUserRoleDto {
  @ApiProperty({
    description: "UUID de l'utilisateur",
  })
  @IsUUID()
  user_uuid: string;

  @ApiProperty({
    description: 'UUID du rôle à associer',
  })
  @IsUUID()
  role_uuid: string;

  @ApiProperty({
    description: 'Statut actif du rôle pour cet utilisateur',
    default: true,
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean = true;
}
