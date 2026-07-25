import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { DateTimeEntity } from 'src/shared/entities/date-time.entity';

/**
 * Réglage runtime générique (clé/valeur), source de vérité pour la configuration
 * modifiable À CHAUD sans redéploiement — d'abord utilisée pour le fournisseur SMS
 * actif et ses toggles (cf. `SmsDispatcher`).
 *
 * ⚠️ Les colonnes s'appellent `setting_key` / `setting_value` (et NON `key`/`value`
 * qui sont des mots réservés MySQL : `KEY`, `VALUES`) pour éviter tout piège de SQL
 * brut dans la migration. Ne stocke QUE des réglages non sensibles (pas de secrets :
 * les credentials des fournisseurs restent en `.env`).
 */
@Entity({ name: 'app_settings' })
export class AppSetting extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty()
  @Column({ type: 'char', length: 36, unique: true, default: () => '(UUID())' })
  uuid: string;

  /** Clé unique du réglage (ex. `sms.active_provider`). */
  @Column({ name: 'setting_key', type: 'varchar', length: 191, unique: true })
  setting_key: string;

  /** Valeur sérialisée en texte (string / 'true' / JSON selon `type`). */
  @Column({ name: 'setting_value', type: 'text', nullable: true })
  setting_value: string | null;

  /** Type logique de la valeur : 'string' | 'boolean' | 'json'. */
  @Column({ type: 'varchar', length: 16, default: 'string' })
  type: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;
}
