import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  BeforeUpdate,
  OneToMany,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ApiProperty } from '@nestjs/swagger';
import { DateTimeEntity } from '../../shared/entities/date-time.entity';
import { RoleType } from 'src/shared/enums/types.enums';
import { slugify } from 'transliteration';
import { RolePermissionEntity } from 'src/role-permission/entities/role-permission.entity';
import { UserRole } from 'src/user-roles/entities/user-roles.entity';

@Entity('roles')
export class Role extends DateTimeEntity {
  @ApiProperty({ description: 'Identifiant auto-incrémenté du rôle' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'UUID unique du rôle' })
  @Column({ unique: true })
  uuid: string;

  @ApiProperty({ description: 'Nom du rôle (unique)' })
  @Column({ unique: true })
  name: string;

  @ApiProperty({ description: 'Slug du rôle (unique)' })
  @Column({ unique: true })
  slug: string;

  @OneToMany(() => UserRole, (userRole) => userRole.role, { cascade: true })
  user_roles: UserRole[];

  @BeforeInsert()
  generateUUIDAndSlug() {
    this.uuid = uuidv4();
    this.slug = slugify(this.name);
  }

  @BeforeUpdate()
  updateSlug() {
    this.slug = slugify(this.name);
  }

  @OneToMany(
    () => RolePermissionEntity,
    (rolePermission) => rolePermission.role,
  )
  rolePermissions: RolePermissionEntity[];
}
