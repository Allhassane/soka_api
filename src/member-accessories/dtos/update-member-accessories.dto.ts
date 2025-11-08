import { PartialType } from '@nestjs/mapped-types';
import { CreateMemberAccessoryDto } from './create-member-accessories.dto';

export class UpdateMemberAccessoryDto extends PartialType(CreateMemberAccessoryDto) {}
