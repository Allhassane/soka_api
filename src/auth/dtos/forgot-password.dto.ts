import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Numéro de téléphone du compte', example: '0700000000' })
  @IsString()
  @IsNotEmpty()
  phone_number: string;
}
