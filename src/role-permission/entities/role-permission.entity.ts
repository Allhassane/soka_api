import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PermissionEntity } from '../../permission/entities/permission.entity';
import { Role } from '../../roles/entities/role.entity';

@Entity('roles_permissions')
export class RolePermissionEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ unique: true })
  uuid: string;

  @Column()
  role_id: number;

  @Column()
  permission_id: number;

  @Column({ nullable: false })  
  role_uuid: string;

  @Column({ nullable: false }) 
  permission_uuid: string;

  @Column({ default: false })
  status: boolean;

  @ManyToOne(() => PermissionEntity, (permission) => permission.rolePermissions, {
    onDelete: 'CASCADE',
  })
  @ManyToOne(() => Role, (role) => role.rolePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @ManyToOne(() => PermissionEntity, (permission) => permission.rolePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission: PermissionEntity;
}
