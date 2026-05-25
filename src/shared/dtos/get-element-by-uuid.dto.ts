import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export default class GetElementByUuidDto {
  @ApiProperty({
    description: "UUID de l'element",
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  uuid: string;

  @ApiProperty({
    description: "UUID de la campagne active",
    required: false,
  })
  @IsString()
  @IsOptional()
  form_campaign_uuid?: string;
}
