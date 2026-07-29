import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({
    description: 'Nom du rôle (unique). Le slug en est dérivé automatiquement.',
    example: 'Coordonnateur',
    maxLength: 100,
  })
  @IsString({ message: 'Le nom du rôle doit être une chaîne de caractères.' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsNotEmpty({ message: 'Le nom du rôle est obligatoire.' })
  @MaxLength(100, {
    message: 'Le nom du rôle ne doit pas dépasser 100 caractères.',
  })
  name: string;
}
