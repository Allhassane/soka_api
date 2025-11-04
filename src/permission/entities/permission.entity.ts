import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ModuleEntity } from '../../module/entities/module.entity';
import { RolePermissionEntity } from '../../role-permission/entities/role-permission.entity';

@Entity('permissions')
export class PermissionEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

 //@Column({ type: 'uuid',nullable: false, default: () => 'gen_random_uuid()' })
 @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
 uuid: string ;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

@Column({ type: 'text', nullable: true })
  description?: string;

 @Column({ nullable: true })
 module_uuid: string;

  /* @ManyToOne(() => ModuleEntity, (module) => module.permissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'module_uuid', referencedColumnName: 'uuid' }) */
  @ManyToOne(() => ModuleEntity, (module) => module.permissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'module_uuid', referencedColumnName: 'uuid' })
  module: ModuleEntity;

  @OneToMany(() => RolePermissionEntity, (rolePermission) => rolePermission.permission)
  rolePermissions: RolePermissionEntity[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  
}
