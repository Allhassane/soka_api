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
import { slugify } from 'transliteration';
import { RolePermissionEntity } from 'src/role-permission/entities/role-permission.entity';
import { UserRole } from 'src/user-roles/entities/user-roles.entity';

/** Statuts d'un rôle - même convention que `modules`, `responsibilities` et `committees`. */
export const ROLE_STATUSES = ['enable', 'disable'] as const;
export type RoleStatus = (typeof ROLE_STATUSES)[number];

@Entity('roles')
export class Role extends DateTimeEntity {
  /**
   * ⚠️ En base, `roles.id` est un **CHAR(36) égal à `uuid`** (héritage Laravel), sans
   * AUTO_INCREMENT ni DEFAULT : TypeORM renvoie donc une string dans ce champ typé `number`.
   * Le type n'est PAS corrigé volontairement - `ResponsibilityEntity` et `UserRole` déclarent
   * des `@JoinColumn({ referencedColumnName: 'id' })` dessus, le changer casserait le boot.
   * Conséquence : les LECTURES fonctionnent, mais tout `save()` d'un rôle neuf échoue
   * (« Field 'id' doesn't have a default value ») ⇒ la création passe par un INSERT explicite
   * qui fournit `id` (cf. `RoleService.insertRole`).
   */
  @ApiProperty({ description: 'Identifiant du rôle (CHAR(36) en base, égal à l’uuid)' })
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

  @ApiProperty({
    description: 'Statut du rôle. Un rôle désactivé reste listé mais sort des sélecteurs.',
    enum: ROLE_STATUSES,
    default: 'enable',
  })
  @Column({ type: 'varchar', length: 36, default: 'enable' })
  status: RoleStatus;

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
