import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: 'Prénom', required: false })
  @IsOptional()
  @IsString()
  firstname?: string;

  @ApiProperty({ description: 'Nom de famille', required: false })
  @IsOptional()
  @IsString()
  lastname?: string;

  @ApiProperty({ description: 'Email', required: false })
  @IsOptional()
  @IsEmail({}, { message: 'Adresse email invalide' })
  email?: string;

  @ApiProperty({ description: 'Mot de passe', required: false, minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({ description: 'URL de la photo de profil', required: false })
  @IsOptional()
  @IsString()
  profil_picture?: string;

  @ApiProperty({ description: 'Statut actif', default: true, required: false })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({ description: 'Adresse', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ description: 'Téléphone (obligatoire)' })
  @IsString()
  @IsNotEmpty()
  phone_number: string;
}
