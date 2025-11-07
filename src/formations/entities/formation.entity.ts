import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { Entity, PrimaryGeneratedColumn, Column, BeforeInsert, BeforeUpdate} from 'typeorm';

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '') // accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

@Entity({ name: 'formations' })
export class FormationEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 36 })
  admin_uuid: string;

  @Column({ type: 'varchar', length: 36, default: 'enable' })
  statut: string;

  @BeforeInsert()
  @BeforeUpdate()
  generateSlug() {
    if (this.name) this.slug = slugify(this.name);
  }

}
