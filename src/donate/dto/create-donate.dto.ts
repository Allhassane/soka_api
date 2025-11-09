import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { DonateCategory } from 'src/shared/enums/donate.enum';

export class CreateDonateDto {
  @ApiProperty({
    example: 'Campagne de don pour la structure',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    example: '01/01/2025',
    required: true,
  })
  @IsNotEmpty()
  @IsDate()
  starts_at: Date;

  @ApiProperty({
    example: '01/06/2025',
    required: true,
  })
  @IsNotEmpty()
  @IsDate()
  stops_at: Date;

  @ApiProperty({
    example: 'created',
    required: true,
    enum: DonateCategory,
  })
  @IsNotEmpty()
  @IsString()
  category: string;

  @ApiProperty({
    example: '1000',
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  amount: number;
}
