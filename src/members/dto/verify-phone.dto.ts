import { IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class VerifyPhoneNumberDto {
    @ApiProperty({ description: 'Numéro de téléphone' })
    @IsString()
    @IsNotEmpty()
    phone: string;

    @ApiProperty({ description: 'Catégorie (principal, whatsapp, etc.)' })
    @IsString()
    @IsNotEmpty()
    category: string;
}