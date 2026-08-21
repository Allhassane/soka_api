import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginLogEntity, LoginOutcome } from './entities/login-log.entity';

/** Contexte de la requête HTTP, quand on l'a. Tout est optionnel : on écrit sans. */
export interface LoginContext {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Écriture du journal de connexion.
 *
 * 🚨 **Règle unique et absolue : ce service ne fait JAMAIS échouer une connexion.** Il est
 * appelé sur le chemin synchrone du login ; une table pleine, un index verrouillé ou une
 * base momentanément indisponible doivent produire une ligne de log applicative, jamais un
 * 500 sur `POST /auth/login`. D'où le `catch` qui avale tout. La statistique est une
 * conséquence de la connexion, jamais sa condition.
 *
 * 🚨 **Ne reçoit jamais le mot de passe** - ni en clair, ni haché. La signature ne le
 * permet même pas.
 */
@Injectable()
export class LoginJournalService {
  private readonly logger = new Logger(LoginJournalService.name);

  constructor(
    @InjectRepository(LoginLogEntity)
    private readonly repo: Repository<LoginLogEntity>,
  ) {}

  async record(entry: {
    outcome: LoginOutcome;
    identifier?: string | null;
    userUuid?: string | null;
    context?: LoginContext;
  }): Promise<void> {
    try {
      await this.repo.insert({
        outcome: entry.outcome,
        // Tronqués à la longueur de colonne : un en-tête `User-Agent` fantaisiste ne doit
        // pas transformer l'insertion en erreur (`Data too long`), donc en connexion perdue.
        identifier: tronquer(entry.identifier, 191),
        user_uuid: entry.userUuid ?? null,
        ip: tronquer(entry.context?.ip, 45),
        user_agent: tronquer(entry.context?.userAgent, 255),
      });
    } catch (err: any) {
      this.logger.error(
        `Journal de connexion non écrit (${entry.outcome}) : ${err?.message ?? 'erreur inconnue'}`,
      );
    }
  }
}

/**
 * Contexte réseau d'une requête Express. `req.ip` tient compte de `trust proxy` quand il est
 * configuré ; derrière le proxy de production il vaut sinon l'adresse du proxy - ce qui reste
 * exploitable pour compter, pas pour identifier. On ne lit PAS `x-forwarded-for` à la main :
 * cet en-tête est falsifiable par le client, et un balayage pourrait s'y dissimuler.
 */
export function contexteDeRequete(req: unknown): LoginContext {
  const r = (req ?? {}) as {
    ip?: string;
    headers?: Record<string, unknown>;
    socket?: { remoteAddress?: string };
  };
  const ua = r.headers?.['user-agent'];
  return {
    ip: r.ip ?? r.socket?.remoteAddress ?? null,
    userAgent: typeof ua === 'string' ? ua : null,
  };
}

function tronquer(valeur: string | null | undefined, max: number): string | null {
  const v = (valeur ?? '').trim();
  if (!v) return null;
  return v.length > max ? v.slice(0, max) : v;
}
