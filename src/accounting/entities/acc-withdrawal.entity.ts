import { randomUUID } from 'crypto';
import { BeforeInsert, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';

/**
 * Un **retrait** : de l'argent sorti du compte de collecte HUB2 (reversement vers un compte
 * bancaire, vers le compte de transfert…), saisi à la main par la comptabilité.
 *
 * Il entre dans le décompte du solde : `initial + brut - commission - retraits = net attendu`.
 * Sans lui, le premier retrait fait diverger pour toujours le solde relevé du calcul - c'est ce
 * qui s'est produit le 2026-09-16 (100 000 F, écran rouge en production jusqu'au 26/09).
 *
 * ⚠️ **Saisie manuelle, faute de source** : ni le guichet ni HUB2 ne transmettent les retraits à
 * l'application. Une saisie erronée s'**annule** (suppression logique, auteur conservé), elle ne
 * s'efface pas : le décompte doit rester explicable après coup.
 */
@Entity({ name: 'acc_withdrawals' })
export class AccWithdrawalEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  // Pas de `default: () => '(UUID())'` : blocage binlog STATEMENT connu sur cette base.
  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  @BeforeInsert()
  ensureUuid() {
    this.uuid = this.uuid ?? randomUUID();
  }

  /** Montant retiré, en F CFA, strictement positif. */
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: string;

  /** Jour du retrait (`AAAA-MM-JJ`) - jamais dans le futur. */
  @Column({ type: 'date' })
  withdrawn_on: string;

  /** Motif du retrait, obligatoire : un retrait sans motif ne s'explique pas. */
  @Column({ type: 'varchar', length: 255 })
  label: string;

  /** Référence de l'opération (HUB2, banque…), facultative. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  created_by_uuid: string | null;

  /** Qui a annulé la saisie : l'annulation doit se justifier autant que la saisie. */
  @Column({ type: 'char', length: 36, nullable: true })
  deleted_by_uuid: string | null;
}
