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

@Entity({ name: 'countries' })
export class CountryEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  @Column()
  name: string;

  @Column({type: 'char', length: 191, nullable: true})
  captial?: string;

  @Column({type: 'char', length: 191, nullable: true})
  continent?: string;

  @Column({ type: 'varchar', length: 36, default: 'enable' })
  status: string;

  // La colonne réelle `countries.uuid` a un DEFAULT NULL (synchronize OFF), donc le
  // `default: () => '(UUID())'` ci-dessus n'est jamais appliqué → les pays créés
  // arrivaient avec uuid = NULL et devenaient impossibles à modifier/supprimer
  // (PUT/DELETE /countries/<null> → 404). On génère donc l'uuid en amont, comme
  // MemberEntity (le modèle de référence).
  @BeforeInsert()
  generateUuid() {
    if (!this.uuid) this.uuid = uuidv4();
  }
}
