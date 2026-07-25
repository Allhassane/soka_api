import { IsIn, IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/** Les deux seules catégories que `MemberService.verifyPhoneNumber` sait traiter. */
export const PHONE_CATEGORIES = ['principal', 'whatsapp'] as const;

export class VerifyPhoneNumberDto {
    @ApiProperty({ description: 'Numéro de téléphone' })
    @IsString()
    @IsNotEmpty()
    phone: string;

    // ⚠️ L'enum n'est pas cosmétique : le service ne teste que 'principal' et 'whatsapp'.
    // Sans cette garde, toute autre valeur laissait `member` à undefined et la réponse
    // annonçait « Le numero de telephone est disponible » pour un numéro pourtant déjà pris —
    // faux négatif silencieux dans le formulaire d'ajout de membre.
    @ApiProperty({ description: 'Catégorie du numéro', enum: PHONE_CATEGORIES })
    @IsString()
    @IsNotEmpty()
    @IsIn(PHONE_CATEGORIES as unknown as string[], {
        message: `category doit valoir ${PHONE_CATEGORIES.join(' ou ')}`,
    })
    category: string;
}
