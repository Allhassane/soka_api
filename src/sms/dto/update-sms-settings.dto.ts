import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { SMS_PROVIDER_NAMES, SmsProviderName } from '../sms.constants';

export class SetActiveProviderDto {
  @ApiProperty({ enum: SMS_PROVIDER_NAMES, example: 'letexto' })
  @IsIn(SMS_PROVIDER_NAMES, {
    message: `active_provider doit être l'un de : ${SMS_PROVIDER_NAMES.join(', ')}`,
  })
  active_provider: SmsProviderName;
}

export class ToggleProviderDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;
}

export class SetFailoverDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;
}

export class SetBroadcastDto {
  @ApiProperty({
    example: true,
    description:
      'true = chaque SMS part par TOUS les fournisseurs activés (le membre reçoit 2 SMS).',
  })
  @IsBoolean()
  enabled: boolean;
}

export class TestSmsDto {
  @ApiProperty({ enum: SMS_PROVIDER_NAMES, example: 'smspro' })
  @IsIn(SMS_PROVIDER_NAMES)
  provider: SmsProviderName;

  @ApiProperty({ example: '0749326623', description: 'Numéro de contrôle (CI)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  to: string;
}
