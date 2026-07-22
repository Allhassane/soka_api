import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddCommitteeMemberDto {
  @ApiProperty({
    description: "UUID du membre à ajouter au comité",
    example: 'a1b2c3d4-...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le membre est requis' })
  @Length(36, 36)
  member_uuid: string;
}
