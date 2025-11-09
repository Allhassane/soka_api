import { IsDate, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { CategoryDonate } from "../entities/donate.entity";
import { Type } from "class-transformer";
import { GlobalStatus } from "src/shared/enums/global-status.enum";

export class CreateDonateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsDate()
  @IsNotEmpty()
  @Type(() => Date)
  start_at: Date;

  @IsDate()
  @IsNotEmpty()
  @Type(() => Date)
  stop_at: Date;

  @IsNotEmpty()
  @IsEnum(CategoryDonate)
  category: CategoryDonate;

  @IsInt()
  @IsNotEmpty()
  amount: number;

  @IsInt()
  @IsOptional()
  donate_number?: number;

  @IsString()
  @IsNotEmpty()
  history: string;

  @IsEnum(GlobalStatus)
  @IsOptional()
  status?: GlobalStatus;

}
