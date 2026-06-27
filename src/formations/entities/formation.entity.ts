import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { Entity, PrimaryGeneratedColumn, Column, BeforeInsert, BeforeUpdate} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

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
  status: string;

  @BeforeInsert()
  @BeforeUpdate()
  generateSlug() {
    if (this.name) this.slug = slugify(this.name);
  }

  // La colonne réelle `formations.uuid` a un DEFAULT NULL (synchronize OFF), donc le
  // `default: () => '(UUID())'` ci-dessus n'est jamais appliqué → les formations créées
  // arriveraient avec uuid = NULL. On génère donc l'uuid en amont, comme CountryEntity.
  @BeforeInsert()
  generateUuid() {
    if (!this.uuid) this.uuid = uuidv4();
  }

}
