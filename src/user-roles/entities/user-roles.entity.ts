import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ApiProperty } from '@nestjs/swagger';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { Role } from 'src/roles/entities/role.entity';
import { User } from 'src/users/entities/user.entity';

@Entity('user_roles')
export class UserRole extends DateTimeEntity {
  @ApiProperty({
    description: 'Identifiant auto-incrémenté',
  })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({
    description: 'UUID unique du lien user/role',
  })
  @Column({ unique: true })
  uuid: string;

  @ApiProperty({
    description: "UUID de l'utilisateur",
  })
  @Column()
  user_uuid: string;

  @ApiProperty({
    description: 'UUID du rôle attribué',
  })
  @Column()
  role_uuid: string;

  @ApiProperty({
    description: 'Indique si le rôle est actif pour cet utilisateur',
    default: true,
    example: true,
  })
  @Column({ default: true })
  is_active: boolean;

  @ApiProperty({
    description: 'UUID de la zone associée (optionnel)',
    required: false,
  })
  @Column({ nullable: true })
  zone_uuid: string;

  @ManyToOne(() => User, (user) => user.user_roles, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Role, (role) => role.user_roles, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @BeforeInsert()
  generateUUID() {
    this.uuid = uuidv4();
  }
}
