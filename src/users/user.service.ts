import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { Role } from '../roles/entities/role.entity';
import { PaginateMeta } from '../shared/interfaces/paginate-meta.interface';
import { POSTGRES_ERROR_CODES } from '../shared/constants/postgres-error-codes.constant';
import { PostgresError } from '../shared/enums/post-gres.enum';
import { buildPaginationMeta } from 'src/shared/helpers/pagination-meta.helper';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    private readonly mailer: MailerService,
  ) {}

  async onModuleInit() {
    const existing = await this.userRepo.findOne({
      where: [{ email: 'superadmin@soka.com' }],
    });

    if (!existing) {
      /*const superadminRole = await this.roleRepo.findOne({
        where: { name: 'superadmin' },
      });

      if (!superadminRole) {
        console.warn('Le rôle superadmin est introuvable, création annulée.');
        return;
      }*/

      const user = this.userRepo.create({
        uuid: uuidv4(),
        firstname: 'Admin',
        lastname: 'Root',
        email: 'superadmin@soka.com',
        phone_number: '0700000000',
        password: 'password',
        is_active: true,
      });

      await this.userRepo.save(user);
    }
  }

  private generateStrongPassword(len = 14): string {
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const symbols = '!@#$%^&*()-_=+[]{};:,.?';
    const all = lower + upper + digits + symbols;

    const pick = (set: string) => set[crypto.randomInt(0, set.length)];
    const base = [pick(lower), pick(upper), pick(digits), pick(symbols)];

    while (base.length < len) base.push(pick(all));
    for (let i = base.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [base[i], base[j]] = [base[j], base[i]];
    }
    return base.join('');
  }

  async sendAccountCreatedEmail(params: {
    to: string;
    account: string;
    firstname?: string;
    lastname?: string;
    generatedPassword?: string;
    providedPassword?: string;
  }) {
    const { to, firstname, lastname, generatedPassword, providedPassword } =
      params;

    const subject = generatedPassword
      ? 'Le compte a été créé – identifiants'
      : 'Le compte a été créé';

    const fullName =
      [firstname, lastname].filter(Boolean).join(' ').trim() || 'Utilisateur';

    const lines: string[] = [
      `Bonjour ${fullName},`,
      '',
      `Le compte a bien été créé.`,
    ];

    if (generatedPassword) {
      lines.push(
        '',
        'Voici les identifiants de connexion :',
        `• Identifiant : ${params.account}`,
        `• Mot de passe par défaut : ${generatedPassword}`,
        '',
      );
    } else if (providedPassword) {
      lines.push(
        '',
        'Rappel : un mot de passe a été défini lors de la création.',
        `• Identifiant : ${params.account}`,
        `• Mot de passe : ${providedPassword}`,
      );
    } else {
      lines.push('', `Identifiant : ${params.account}`);
    }

    lines.push('', 'Cordialement,', 'L’équipe Support');

    await this.mailer.sendMail({
      to,
      subject,
      text: lines.join('\n'),
    });
  }

  async create(dto: CreateUserDto, admin: User): Promise<User> {
    const uuid = uuidv4();
    const rawPassword = dto.password?.trim() || this.generateStrongPassword();

    const f = dto.firstname?.trim();
    const l = dto.lastname?.trim();
    const withNameDefaults =
      !f && !l
        ? { firstname: 'SOKA', lastname: 'User' }
        : { firstname: f ?? dto.firstname, lastname: l ?? dto.lastname };

    const user = this.userRepo.create({
      ...dto,
      ...withNameDefaults,
      uuid,
      password: rawPassword,
      is_active: dto.is_active ?? true,
      phone_number: dto.phone_number?.trim(),
    });

    try {
      const saved = await this.userRepo.save(user);

      await this.sendAccountCreatedEmail({
        to: admin.email ?? 'no-reply@soka.local',
        account: saved.phone_number,
        firstname: admin.firstname,
        lastname: admin.lastname,
        generatedPassword: dto.password ? undefined : rawPassword,
        providedPassword: dto.password ? rawPassword : undefined,
      });

      delete (saved as any).password;
      return saved;
    } catch (error: unknown) {
      this.handlePostgresUniqueViolation(error);
    }
  }

  private handlePostgresUniqueViolation(error: unknown): never {
    const err = error as PostgresError;
    if (
      err.code === POSTGRES_ERROR_CODES.UNIQUE_VIOLATION &&
      typeof err.detail === 'string'
    ) {
      if (err.detail.includes('(phone_number)')) {
        throw new ConflictException('Numéro de téléphone déjà utilisé');
      }
      if (err.detail.includes('(email)')) {
        throw new ConflictException('Adresse email déjà utilisée');
      }
      throw new ConflictException('Contrainte d’unicité violée');
    }
    throw error;
  }

  async findAll(
    page = 1,
    limit = 10,
  ): Promise<{ data: User[]; meta: Omit<PaginateMeta, 'page'> }> {
    const [data, total] = await this.userRepo
      .createQueryBuilder('user')
      .orderBy('user.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: buildPaginationMeta({ total, page, perPage: limit }),
    };
  }

  async findOneByUuid(uuid: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { uuid },
      relations: ['user_roles', 'user_roles.role'],
    });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    return user;
  }

  async findByIdWithRole(id: number): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['user_roles', 'user_roles.role'],
    });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');
    return user;
  }

  async findUserRoles(uuid: string) {
    const roles = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.user_roles', 'ur')
      .innerJoin('ur.role', 'role')
      .select([
        'role.uuid AS role_uuid',
        'role.name AS role_name',
        'role.slug AS role_slug',
      ])
      .where('ur.user_uuid = :uuid', { uuid })
      .distinct(true)
      .getRawMany();

    if (!roles)
      throw new NotFoundException('Rôles non trouvés pour l’utilisateur');
    return roles;
  }

  async search(keyword: string): Promise<User[]> {
    return this.userRepo
      .createQueryBuilder('user')
      .where('LOWER(user.email) LIKE LOWER(:kw)', { kw: `%${keyword}%` })
      .orWhere('LOWER(user.firstname) LIKE LOWER(:kw)', { kw: `%${keyword}%` })
      .orWhere('LOWER(user.lastname) LIKE LOWER(:kw)', { kw: `%${keyword}%` })
      .orWhere('user.phone_number LIKE :kw', { kw: `%${keyword}%` })
      .orderBy('user.created_at', 'DESC')
      .getMany();
  }

  async findByLoginWithPassword(identifier: string): Promise<User | null> {
    return this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :id OR user.phone_number = :id', { id: identifier })
      .getOne();
  }

  async update(uuid: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOneByUuid(uuid);
    Object.assign(user, dto);
    return await this.userRepo.save(user);
  }

  async remove(uuid: string): Promise<void> {
    const user = await this.findOneByUuid(uuid);
    await this.userRepo.remove(user);
  }
}
