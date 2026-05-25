import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class LoginDto {
  @ApiProperty({
    description: "Numéro de téléphone de l'utilisateur",
    example: '0700000000',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '').trim() : value,
  )
  phone_number: string;

  @ApiProperty({
    description: "Mot de passe de l'utilisateur",
    example: 'password',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
