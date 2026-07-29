import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { Entity, PrimaryGeneratedColumn, Column, BeforeInsert, BeforeUpdate, OneToMany } from 'typeorm';
import { CommitteeMemberEntity } from './committee-member.entity';

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '') // accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

@Entity({ name: 'committees' })
export class CommitteesEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  //@Column({ type: 'uuid', unique: true, default: () => 'gen_random_uuid()' }) // Postgres extension pgcrypto or use uuid-ossp
  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 36 })
  admin_uuid: string;

  /** Membre désigné responsable du comité (assigné par un admin). */
  @Column({ type: 'char', length: 36, nullable: true })
  responsible_member_uuid: string | null;

  /**
   * Rôle porté par le comité - **donnée de référence** (comme sur `responsibilities`), obligatoire
   * à la création côté DTO, nullable en base car les comités antérieurs n'ont pas pu être remplis.
   *
   * Pas de relation `@ManyToOne` vers `Role` : le rôle est résolu par une requête séparée et
   * batchée dans `CommitteeService.loadRefs()` (« pattern B » du projet - liaison par uuid,
   * jointure à la main), ce qui évite un N+1 sur la liste des comités.
   * (Note : une jointure SQL `committees` × `roles` serait parfaitement valide malgré les
   * collations différentes - MySQL convertit latin1 vers utf8mb4. Cf. gotcha « Collations »
   * dans `CLAUDE.md`.)
   */
  @Column({ type: 'char', length: 36, nullable: true })
  role_uuid: string | null;

  /** Niveau porté par le comité (facultatif). Même contrainte que `role_uuid` : pas de relation ORM. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  level_uuid: string | null;

  @Column({ type: 'varchar', length: 36, default: 'enable' })
  status: string;

  @OneToMany(() => CommitteeMemberEntity, (cm) => cm.committee)
  members: CommitteeMemberEntity[];

  @BeforeInsert()
  @BeforeUpdate()
  generateSlug() {
    if (this.name) this.slug = slugify(this.name);
  }

}
