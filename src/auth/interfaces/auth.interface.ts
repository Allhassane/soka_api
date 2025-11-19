import { Role } from 'src/roles/entities/role.entity';

export interface AuthCredentialsDto {
  sub: number;
  email?: string | null;
  phone_number?: string;
  member_uuid?: string | null;
  roles?: Role[];
}

export interface JwtPayload extends AuthCredentialsDto {
  uuid: string;
}

export interface DecodedJwt extends AuthCredentialsDto {
  iat?: number;
  exp?: number;
}
