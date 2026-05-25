import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignPermissionToRoleDto {
  @ApiProperty()
  @IsUUID()
  role_uuid: string;

  @ApiProperty()
  @IsUUID()
  permission_uuid: string;
}
