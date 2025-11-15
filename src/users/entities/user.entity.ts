import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BeforeInsert,
  BeforeUpdate,
  OneToMany,
} from 'typeorm';
import { ApiProperty, ApiHideProperty } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { UserRole } from 'src/user-roles/entities/user-roles.entity';

@Entity('users')
export class User extends DateTimeEntity {
  @ApiProperty({ description: 'Identifiant auto-incrémenté (PK)' })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'UUID unique de l’utilisateur (clé publique)' })
  @Column({ unique: true })
  uuid: string;

  @ApiProperty({ description: 'Prénom', required: false })
  @Column({ type: 'varchar', nullable: true })
  firstname?: string;

  @ApiProperty({ description: 'Nom', required: false })
  @Column({ type: 'varchar', nullable: true })
  lastname?: string;

  @ApiProperty({ description: 'Email (unique, optionnel)', required: false })
  @Column({ type: 'varchar', unique: true, nullable: true })
  email?: string;

  @ApiProperty({ description: 'Actif ?', default: true })
  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @ApiProperty({ description: 'Mot de passe hashé' })
  @Column({ type: 'varchar', select: false })
  password: string;

  @ApiProperty({ description: 'Photo de profil', required: false })
  @Column({ type: 'varchar', nullable: true })
  profil_picture?: string;

  @ApiProperty({ description: 'Adresse', required: false })
  @Column({ type: 'varchar', nullable: true })
  address?: string;

  @ApiProperty({ description: 'Téléphone (unique, requis)' })
  @Column({ type: 'varchar', unique: true })
  phone_number: string;

  @OneToMany(() => UserRole, (userRole) => userRole.user, { cascade: true })
  user_roles: UserRole[];
  @BeforeInsert()
  ensureUuid(): void {
    if (!this.uuid) {
      this.uuid = uuidv4();
    }
  }

  @Column({ type: 'varchar', length: 255, nullable: true })
  member_uuid: string;

  @Column({ type: 'boolean', default: false })
  is_sent: boolean;

  @Column({ type: 'boolean', default: false })
  is_admin: boolean;

  @Column({ type: 'datetime', nullable: true })
  sending_at: Date;

  @Column({ type: 'varchar', nullable: true })
  password_no_hashed: string;

  @Column({ type: 'boolean', default: false })
  is_connected: boolean;





  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword(): Promise<void> {
    if (this.password && !this.password.startsWith('$2')) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
  }
}
