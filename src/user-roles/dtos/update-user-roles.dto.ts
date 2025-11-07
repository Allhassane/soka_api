import { PartialType } from '@nestjs/mapped-types';
import { CreateUserRoleDto } from './create-user-roles.dto';

export class UpdateUserRoleDto extends PartialType(CreateUserRoleDto) {}
