import { PartialType } from '@nestjs/mapped-types';
import { CreateMemberResponsibilityDto } from './create-member-responsibility.dto';

export class UpdateMemberResponsibilityDto extends PartialType(
  CreateMemberResponsibilityDto,
) {}
