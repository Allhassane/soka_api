import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RoleUuidDto {
  @ApiProperty({ description: 'UUID du rôle' })
  @IsNotEmpty()
  @IsString()
  uuid: string;
}
