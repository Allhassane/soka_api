import { DateTimeEntity } from 'src/shared/entities/date-time.entity';
import { BeforeInsert, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/** Statut du dossier : nomme **l'étape attendue** tant qu'il en reste une. */
export enum RegistrationStatus {
  EN_ATTENTE_DISTRICT = 'EN_ATTENTE_DISTRICT',
  EN_ATTENTE_CHAPITRE = 'EN_ATTENTE_CHAPITRE',
  /** Les deux signatures sont acquises : le membre a été créé (`member_uuid` renseigné). */
  VALIDEE = 'VALIDEE',
  /** Refus à l'une ou l'autre étape. **Clos définitivement** (règle R7). */
  REFUSEE = 'REFUSEE',
  ANNULEE = 'ANNULEE',
}

/** Décision portée par une étape de validation. */
export enum StepDecision {
  EN_ATTENTE = 'EN_ATTENTE',
  APPROUVEE = 'APPROUVEE',
  REFUSEE = 'REFUSEE',
  /** Acquise d'office : le déposant avait déjà autorité à ce niveau (règle R4). */
  ACQUISE = 'ACQUISE',
  /** Aucune structure de ce niveau au-dessus de la saisie (ex. membre rattaché à un CHAPITRE). */
  SANS_OBJET = 'SANS_OBJET',
}

/** Les deux niveaux de validation, dans l'ordre où ils sont sollicités. */
export enum ValidationLevel {
  DISTRICT = 'DISTRICT',
  CHAPITRE = 'CHAPITRE',
}

/**
 * Dossier d'enregistrement d'un membre, en attente de validation.
 *
 * ⚠️ **Ce n'est pas un membre.** Tant que les deux signatures ne sont pas acquises, il n'existe
 * aucune ligne dans `members` : ni matricule, ni compte de connexion, ni présence dans les
 * listes, statistiques, exports ou sélecteurs de bénéficiaires. C'est la décision structurante
 * de la spécification - elle évite d'avoir à filtrer les membres non validés dans le code de
 * tous les autres modules.
 *
 * Spécification : `docs/VALIDATION-MEMBRES.md`.
 */
@Entity({ name: 'member_registrations' })
export class MemberRegistrationEntity extends DateTimeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  uuid: string;

  /**
   * L'uuid est généré ici, pas par la base : `DEFAULT (UUID())` bloque le binlog STATEMENT sur
   * cette base. Même pattern que `MemberEntity.ensureUuid()`.
   */
  @BeforeInsert()
  ensureUuid() {
    this.uuid = this.uuid ?? uuidv4();
  }

  @Column({
    type: 'enum',
    enum: RegistrationStatus,
    default: RegistrationStatus.EN_ATTENTE_DISTRICT,
  })
  status: RegistrationStatus;

  /**
   * Le `CreateMemberDto` **tel que soumis**. On rejoue les contrôles à la validation finale
   * (règle R9) : la civilité, la structure ou le téléphone ont pu changer entre-temps.
   */
  @Column({ type: 'json' })
  payload: Record<string, any>;

  /** Dénormalisés depuis le `payload` : liste, recherche et garde R10 (un dossier par numéro). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  lastname: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  firstname: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  /**
   * Structure de rattachement demandée.
   *
   * Nullable pour une seule raison : un `is_admin` peut aujourd'hui créer un membre sans
   * structure (`assertStructureInScope` ne l'exige que des non-admins). Interdire ce cas ici
   * aurait ajouté un refus qui n'existait pas. Un non-admin, lui, est refusé faute d'autorité
   * (aucun district ni chapitre au-dessus de rien - cf. `planSteps`).
   */
  @Column({ type: 'char', length: 36, nullable: true })
  structure_uuid: string | null;

  /**
   * Ancres figées à la soumission (règle R2), calculées en remontant les ancêtres de
   * `structure_uuid`. `null` ⇒ l'étape correspondante est `SANS_OBJET`.
   */
  @Column({ type: 'char', length: 36, nullable: true })
  district_uuid: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  chapitre_uuid: string | null;

  @Column({ type: 'char', length: 36 })
  submitted_by_user_uuid: string;

  @Column({
    type: 'datetime',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  submitted_at: Date;

  @Column({
    type: 'enum',
    enum: StepDecision,
    default: StepDecision.EN_ATTENTE,
  })
  district_decision: StepDecision;

  @Column({ type: 'char', length: 36, nullable: true })
  district_decided_by_user_uuid: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  district_decided_at: Date | null;

  /** Signée par le niveau supérieur, le district étant vacant (règle R5b). */
  @Column({ type: 'boolean', default: false })
  district_by_delegation: boolean;

  @Column({
    type: 'enum',
    enum: StepDecision,
    default: StepDecision.EN_ATTENTE,
  })
  chapitre_decision: StepDecision;

  @Column({ type: 'char', length: 36, nullable: true })
  chapitre_decided_by_user_uuid: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  chapitre_decided_at: Date | null;

  @Column({ type: 'boolean', default: false })
  chapitre_by_delegation: boolean;

  @Column({ type: 'enum', enum: ValidationLevel, nullable: true })
  refusal_level: ValidationLevel | null;

  /** Obligatoire en cas de refus (règle R7). */
  @Column({ type: 'text', nullable: true })
  refusal_comment: string | null;

  /**
   * Dossier refusé/annulé dont celui-ci est la reprise (règle R7b). Ce n'est **pas** une
   * ré-ouverture : le dossier repart à zéro des deux signatures, le lien ne sert qu'à voir
   * qu'une même personne a été présentée plusieurs fois.
   */
  @Column({ type: 'char', length: 36, nullable: true })
  resumed_from_uuid: string | null;

  /** Membre créé à la validation finale. `null` tant que le dossier n'est pas `VALIDEE`. */
  @Column({ type: 'char', length: 36, nullable: true })
  member_uuid: string | null;

  /** Avec `submitted_at`, donne le délai réel de validation - la mesure qui tranchera la
   * question des notifications (cf. §11 de la spécification). */
  @Column({ type: 'datetime', precision: 6, nullable: true })
  validated_at: Date | null;

  @Column({ type: 'char', length: 36, nullable: true })
  admin_uuid: string | null;
}
