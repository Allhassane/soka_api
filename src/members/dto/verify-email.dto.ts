import { IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class VerifyEmailDto {
    @ApiProperty({ description: 'Email' })
    @IsString()
    @IsNotEmpty()
    email: string;
}