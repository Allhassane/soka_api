import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { User } from './entities/user.entity';

/**
 * Vue minimale d'une fiche membre. Volontairement structurelle plutôt que `MemberEntity` :
 * ce service vit dans `UserModule`, que le module d'import consomme sans devoir tirer le
 * module membres.
 */
export interface MemberAccountSource {
  uuid: string;
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** Ce qui a été fait du compte de connexion, et pourquoi quand rien ne l'a été. */
export type AccountOutcome =
  | 'created'
  | 'updated'
  | 'unchanged'
  /** Pas de téléphone sur la fiche : l'identifiant de connexion **est** le numéro. */
  | 'skipped_no_phone'
  /** Le numéro appartient déjà à un autre compte - en créer un second casserait la connexion. */
  | 'skipped_phone_taken';

/**
 * **Point unique de résolution du compte de connexion d'un membre.**
 *
 * Créer un membre et créer son compte étaient deux gestes séparés : `MemberService.store()`
 * (formulaire) créait le compte, l'**import Excel ne le faisait pas du tout**. Résultat
 * constaté le 2026-07-30 : **360 membres sans compte**, donc incapables de se connecter, et
 * rien dans l'interface ne le signalait - il a fallu un seed de rattrapage
 * (`seed:create-missing-user-accounts`, 197 comptes créés) pour refermer l'écart.
 *
 * ⚠️ **Ne pas réimplémenter la règle chez l'appelant.** Toute voie qui écrit un membre passe
 * par `reconcileAccount()` : deux copies de cette règle divergeraient, et la divergence est
 * invisible (un membre sans compte ressemble à un membre normal jusqu'à sa 1re connexion).
 */
@Injectable()
export class MemberAccountService {
  private readonly logger = new Logger(MemberAccountService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Aligne le compte de connexion sur la fiche : le crée s'il manque, sinon met à jour
   * l'identité qu'il en recopie (nom, prénom, e-mail et surtout **téléphone**, qui est
   * l'identifiant de connexion).
   *
   * @param manager passer le `EntityManager` de la transaction en cours pour que le compte
   *        soit écrit **avec** le membre - sinon un rollback laisserait un compte orphelin.
   */
  async reconcileAccount(
    member: MemberAccountSource,
    manager?: EntityManager,
  ): Promise<AccountOutcome> {
    const db = manager ?? this.userRepo.manager;
    const phone = (member.phone ?? '').trim();

    const linked = await db.findOne(User, {
      where: { member_uuid: member.uuid },
    });

    return linked
      ? this.syncExisting(db, linked, member, phone)
      : this.createAccount(db, member, phone);
  }

  // ─────────────────────────────── création ───────────────────────────────

  private async createAccount(
    db: EntityManager,
    member: MemberAccountSource,
    phone: string,
  ): Promise<AccountOutcome> {
    // L'identifiant de connexion EST le numéro : sans numéro, pas de compte possible.
    if (!phone) return 'skipped_no_phone';

    // Un numéro déjà pris ne peut pas servir deux fois : `users.phone_number` n'a AUCUN
    // index UNIQUE en base (relevé le 2026-07-30), la base n'arrêterait donc pas le
    // doublon - et deux comptes sur un même numéro rendent la connexion ambiguë.
    const takenByAnother = await db.findOne(User, {
      where: { phone_number: phone },
    });
    if (takenByAnother) return 'skipped_phone_taken';

    // `email` est déclaré UNIQUE : réutiliser un e-mail déjà pris ferait échouer l'insert
    // (et, dans une transaction d'import, perdrait la ligne entière). On retombe sur null.
    let email: string | null = (member.email ?? '').trim() || null;
    if (email) {
      const emailTaken = await db.findOne(User, { where: { email } });
      if (emailTaken) email = null;
    }

    // Mot de passe par défaut + `must_change_password` : au 1er login, `AuthService`
    // génère le vrai mot de passe et l'envoie par SMS. Aucun SMS n'est envoyé ici.
    const defaultPassword = process.env.DEFAULT_PASSWORD || 'nrh2030';

    // ⚠️ `repo.create()` + `save()` obligatoires : le hachage du mot de passe est un hook
    // `@BeforeInsert` de l'entité. Un `INSERT` SQL direct stockerait le mot de passe EN CLAIR.
    await db.save(
      this.userRepo.create({
        firstname: member.firstname ?? undefined,
        lastname: member.lastname ?? undefined,
        email: email ?? undefined,
        phone_number: phone,
        password: defaultPassword,
        is_active: true,
        member_uuid: member.uuid,
        must_change_password: true,
      }),
    );

    return 'created';
  }

  // ────────────────────────────── mise à jour ──────────────────────────────

  private async syncExisting(
    db: EntityManager,
    linked: User,
    member: MemberAccountSource,
    phone: string,
  ): Promise<AccountOutcome> {
    const before = {
      firstname: linked.firstname,
      lastname: linked.lastname,
      email: linked.email,
      phone_number: linked.phone_number,
    };

    if (member.firstname) linked.firstname = member.firstname;
    if (member.lastname) linked.lastname = member.lastname;
    if (member.email) linked.email = member.email;

    // Le téléphone n'est pas un champ d'identité comme les autres : c'est l'identifiant de
    // connexion. On ne le déplace donc jamais sur un numéro déjà porté par un autre compte.
    if (phone && phone !== linked.phone_number) {
      const takenByAnother = await db.findOne(User, {
        where: { phone_number: phone },
      });
      if (takenByAnother && takenByAnother.uuid !== linked.uuid) {
        this.logger.warn(
          `Compte ${linked.uuid} : téléphone non réaligné sur ${phone} (déjà porté par ${takenByAnother.uuid}).`,
        );
      } else {
        linked.phone_number = phone;
      }
    }

    const changed =
      before.firstname !== linked.firstname ||
      before.lastname !== linked.lastname ||
      before.email !== linked.email ||
      before.phone_number !== linked.phone_number;

    if (!changed) return 'unchanged';

    await db.save(linked);
    return 'updated';
  }
}
