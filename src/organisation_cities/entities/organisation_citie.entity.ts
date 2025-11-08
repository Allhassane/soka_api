import { slugify } from 'transliteration';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, BeforeInsert, BeforeUpdate, DeleteDateColumn } from 'typeorm';

@Entity('organisation_cities')
export class OrganisationCities {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  @Column({ type: 'varchar', length: 255, })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Permet de faire du soft delete
  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;

  //pour gerer le slug
  @BeforeInsert()
  @BeforeUpdate()
  generateSlug() {
    if (this.name) this.slug = slugify(this.name);
    }

}
