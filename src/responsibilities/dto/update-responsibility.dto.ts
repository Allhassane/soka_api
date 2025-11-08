import { PartialType } from '@nestjs/mapped-types';
import { CreateResponsibilityDto } from './create-responsibility.dto';

export class UpdateResponsibilityDto extends PartialType(
  CreateResponsibilityDto,
) {}
