import { Role } from 'src/roles/entities/role.entity';

export interface AuthCredentialsDto {
  sub: number;
  email?: string | null;
  phone_number?: string;
  member_uuid?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  responsibilities?: {
    uuid: string;
    name: string;
    level_uuid: string;
    level_name: string;
    structure: {
      uuid: string;
      name: string;
    } | null;
  }[];
  roles?: Role[];
  permissions?: string[];
  is_admin?: boolean;

  /**
   * Périmètre hiérarchique figé à la connexion (cf. `AccessScopeService`).
   * `scope_structure_uuid` = racine de ce que l'utilisateur a le droit de voir : son sous-arbre
   * entier est autorisé, tout le reste est refusé. C'est la **borne d'autorisation**, à préférer
   * aux structures de `responsibilities[]` (qui ignorent l'élargissement par les comités).
   * Volontairement compacts : le JWT finit dans un cookie plafonné à 4 096 o.
   */
  scope_structure_uuid?: string | null;
  /** Structure pré-sélectionnée à l'ouverture des écrans (palier le plus bas). */
  default_structure_uuid?: string | null;
  /** `order` du niveau le plus élevé accessible (0 = NATIONAL). */
  max_level_order?: number | null;
}

export interface JwtPayload extends AuthCredentialsDto {
  uuid: string;
}

export interface DecodedJwt extends AuthCredentialsDto {
  iat?: number;
  exp?: number;
}
