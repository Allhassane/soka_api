import { PartialType } from '@nestjs/mapped-types';
import { CreateDonateDto } from './create-donate.dto';

export class UpdateDonateDto extends PartialType(CreateDonateDto) {}
