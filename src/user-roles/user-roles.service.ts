import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from './entities/user-roles.entity';
import { CreateUserRoleDto } from './dtos/create-user-roles.dto';
import { UpdateUserRoleDto } from './dtos/update-user-roles.dto';
import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/roles/entities/role.entity';
import { buildPaginationMeta } from 'src/shared/helpers/pagination-meta.helper';
import { PaginateMeta } from 'src/shared/interfaces/paginate-meta.interface';

@Injectable()
export class UserRoleService {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>
  ) {}

  async create(dto: CreateUserRoleDto): Promise<UserRole> {
    const user = await this.findUserOrFail(dto.user_uuid);
    const role = await this.findRoleOrFail(dto.role_uuid);

    await this.ensureUserRoleIsUnique(dto.user_uuid, dto.role_uuid);

    const userRole = this.userRoleRepo.create({
      ...dto,
      user,
      role,
    });

    return this.userRoleRepo.save(userRole);
  }

  async update(uuid: string, dto: UpdateUserRoleDto): Promise<UserRole> {
    const userRole = await this.findOneByUuid(uuid);

    if (dto.user_uuid) {
      const user = await this.findUserOrFail(dto.user_uuid);
      userRole.user = user;
      userRole.user_uuid = dto.user_uuid;
    }

    if (dto.role_uuid) {
      const role = await this.findRoleOrFail(dto.role_uuid);
      userRole.role = role;
      userRole.role_uuid = dto.role_uuid;
    } 

    Object.assign(userRole, dto);
    return this.userRoleRepo.save(userRole);
  }

  async findAll(
    page = 1,
    limit = 10,
  ): Promise<{ data: UserRole[]; meta: Omit<PaginateMeta, 'page'> }> {
    const [data, total] = await this.userRoleRepo
      .createQueryBuilder('user_role')
      .leftJoinAndSelect('user_role.user', 'user')
      .leftJoinAndSelect('user_role.role', 'role')
      .orderBy('user_role.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: buildPaginationMeta({ total, page, perPage: limit }),
    };
  }

  async findOneByUuid(uuid: string): Promise<UserRole> {
    const userRole = await this.userRoleRepo.findOne({
      where: { uuid },
      relations: ['user', 'role'],
    });
    if (!userRole) throw new NotFoundException('Lien user/role non trouvé');
    return userRole;
  }

  async softDelete(uuid: string): Promise<void> {
    const userRole = await this.findOneByUuid(uuid);
    await this.userRoleRepo.softDelete({ id: userRole.id });
  }

  private async findUserOrFail(user_uuid: string): Promise<User> {
    const user = await this.userRepo.findOneBy({ uuid: user_uuid });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  private async findRoleOrFail(role_uuid: string): Promise<Role> {
    const role = await this.roleRepo.findOneBy({ uuid: role_uuid });
    if (!role) throw new NotFoundException('Rôle introuvable');
    return role;
  }

  private async ensureUserRoleIsUnique(
    user_uuid: string,
    role_uuid: string,
  ): Promise<void> {
    const existing = await this.userRoleRepo
      .createQueryBuilder('ur')
      .innerJoin(Role, 'r', 'r.uuid = ur.role_uuid')
      .where('ur.user_uuid = :user_uuid', { user_uuid })
      .andWhere('ur.role_uuid = :role_uuid', { role_uuid })
      .getOne();

    if (existing) {
      throw new BadRequestException(
        'Ce rôle est déjà assigné à cet utilisateur',
      );
    }
  }

}
