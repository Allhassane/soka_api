import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsBoolean } from 'class-validator';

export class CreateMemberAccessoryDto {
  @ApiProperty({
    description: "UUID du membre",
  })
  @IsUUID()
  member_uuid: string;

  @ApiProperty({
    description: 'UUID de accessoire à associer',
  })
  @IsUUID()
  accessory_uuid: string;

}
