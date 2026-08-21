import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  ADHESION_PLAUSIBLE,
  AGE_BUCKETS,
  AGE_EXPR,
  AGE_PLAUSIBLE,
  ANCIENNETE_BUCKETS,
  ANCIENNETE_EXPR,
  FROM_MEMBRES,
  MemberFilters,
  StatsPerimeter,
  bucketCase,
  buildMemberWhere,
  n,
  taux,
} from './statistics.helpers';

/**
 * Statistiques membres - **agrégats SQL, jamais de chargement d'entités en mémoire**.
 *
 * Trois principes qui expliquent la forme du code :
 *
 * 1. **Un seul `WHERE`** (`buildMemberWhere`) partagé par tous les indicateurs : deux tuiles
 *    du même écran ne peuvent pas compter des populations différentes.
 * 2. **Chaque taux porte sa base.** Les réponses exposent systématiquement le dénominateur
 *    (`base`, `renseignes`) : un pourcentage sur un champ couvert à 38 % sans sa base est un
 *    mensonge poli, et l'écran doit pouvoir l'écrire.
 * 3. **Les anomalies ne sont pas cachées.** Dates aberrantes, incohérences de rattachement,
 *    membres hors arbre : ils sont comptés et rendus, pas filtrés en silence.
 *
 * ⚠️ **Aucune écriture.** Le module est en lecture seule sur toutes les tables métier.
 */
@Injectable()
export class StatisticsService {
  private readonly logger = new Logger(StatisticsService.name);

  /**
   * Cache mémoire à TTL court. Les agrégats balaient ~8 000 membres et 26 000 lignes de
   * closure : c'est rapide, mais inutile à recalculer à chaque changement d'onglet. Un cron
   * de pré-calcul serait de la sur-ingénierie tant qu'on ne veut pas d'historique.
   * ⚠️ La clé inclut le PÉRIMÈTRE : sans ça, la vue d'un administrateur serait resservie à un
   * responsable de district. C'est la ligne la plus importante de ce cache.
   */
  private readonly cache = new Map<string, { at: number; data: any }>();
  private static readonly TTL_MS = 15 * 60 * 1000;
  private static readonly CACHE_MAX = 200;

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // =========================================================================
  // Infrastructure
  // =========================================================================

  private async q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return (await this.ds.query(sql, params)) as T[];
  }

  /** Première ligne, ou un objet vide : évite les `rows[0]?.x ?? 0` partout. */
  private async q1<T = any>(sql: string, params: any[] = []): Promise<T> {
    const rows = await this.q<T>(sql, params);
    return (rows[0] ?? {}) as T;
  }

  private async cached<T>(
    nom: string,
    filters: MemberFilters,
    perimeter: StatsPerimeter,
    calcul: () => Promise<T>,
  ): Promise<T> {
    const cle = JSON.stringify([
      nom,
      perimeter.isAdmin,
      [...(perimeter.allowedRootUuids ?? [])].sort(),
      Object.entries(filters ?? {})
        .filter(([, v]) => v !== undefined && v !== '')
        .sort(([a], [b]) => a.localeCompare(b)),
    ]);
    const hit = this.cache.get(cle);
    if (hit && Date.now() - hit.at < StatisticsService.TTL_MS) return hit.data as T;

    const data = await calcul();
    if (this.cache.size >= StatisticsService.CACHE_MAX) {
      // Éviction du plus ancien : une Map itère dans l'ordre d'insertion.
      const premier = this.cache.keys().next();
      if (!premier.done) this.cache.delete(premier.value);
    }
    this.cache.set(cle, { at: Date.now(), data });
    return data;
  }

  /** uuid d'un palier par son nom (`SOUS_GROUPE`, `DISTRICT`…), mis en cache au premier appel. */
  private paliers: Map<string, { uuid: string; ordre: number }> | null = null;
  private async palier(nom: string): Promise<{ uuid: string; ordre: number } | null> {
    if (!this.paliers) {
      const rows = await this.q<{ uuid: string; name: string; ordre: number }>(
        'SELECT uuid, name, `order` AS ordre FROM levels WHERE deleted_at IS NULL',
      );
      this.paliers = new Map(
        rows.map((r) => [r.name, { uuid: r.uuid, ordre: n(r.ordre) }]),
      );
    }
    return this.paliers.get(nom) ?? null;
  }

  // =========================================================================
  // A - Vue d'ensemble
  // =========================================================================

  async overview(filters: MemberFilters, perimeter: StatsPerimeter) {
    return this.cached('overview', filters, perimeter, async () => {
      const w = buildMemberWhere(filters, perimeter);

      const socle = await this.q1(`
        SELECT COUNT(*) total,
               SUM(m.gender = 'homme') hommes,
               SUM(m.gender = 'femme') femmes,
               SUM(m.gender IS NULL OR m.gender = '') sans_genre,
               SUM(m.has_gohonzon = 1) gohonzon,
               SUM(${AGE_PLAUSIBLE} AND ${AGE_EXPR} < 18) moins_18,
               SUM(u.uuid IS NOT NULL) comptes,
               SUM(u.is_connected = 1) connectes,
               SUM(u.is_sent = 1) mdp_envoyes,
               SUM(u.is_sent = 1 AND (u.is_connected IS NULL OR u.is_connected <> 1)) bloques
          ${FROM_MEMBRES} ${w.sql}`, w.params);

      // Les DEUX autres notions de « jeune ». Elles ne se déduisent pas de l'âge : ce sont
      // des rattachements d'organisation. Les trois sont rendues ensemble, exprès - c'est
      // la décision de conception du 2026-08-19 (§ « jeune » de la spec).
      const jeunesse = await this.q1(`
        SELECT SUM(d.name = 'JEUNESSE') departement_jeunesse,
               SUM(v.name = 'AVENIR') division_avenir
          FROM members m
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
          LEFT JOIN departments d ON d.uuid = m.department_uuid
          LEFT JOIN divisions v ON v.uuid = m.division_uuid
         WHERE m.deleted_at IS NULL ${w.sql}`, w.params);

      const pyramide = await this.q(`
        SELECT l.name palier, l.\`order\` ordre,
               COUNT(DISTINCT s.uuid) structures,
               COUNT(mm.id) membres
          FROM levels l
          LEFT JOIN structures s ON s.level_uuid = l.uuid AND s.deleted_at IS NULL
          LEFT JOIN members mm ON mm.structure_uuid = s.uuid AND mm.deleted_at IS NULL
         WHERE l.deleted_at IS NULL
         GROUP BY l.uuid, l.name, l.\`order\`
         ORDER BY l.\`order\``);

      const total = n(socle.total);
      return {
        effectif: {
          total,
          hommes: n(socle.hommes),
          femmes: n(socle.femmes),
          sans_genre: n(socle.sans_genre),
          taux_feminisation: taux(n(socle.femmes), total),
        },
        // Trois notions distinctes, jamais fusionnées.
        jeunes: {
          moins_18_ans: n(socle.moins_18),
          departement_jeunesse: n(jeunesse.departement_jeunesse),
          division_avenir: n(jeunesse.division_avenir),
        },
        pratique: {
          gohonzon: n(socle.gohonzon),
          taux_gohonzon: taux(n(socle.gohonzon), total),
        },
        adoption: {
          comptes: n(socle.comptes),
          connectes: n(socle.connectes),
          mdp_envoyes: n(socle.mdp_envoyes),
          bloques: n(socle.bloques),
          taux_activation: taux(n(socle.connectes), n(socle.comptes)),
          // Le taux qui compte vraiment : parmi ceux à qui l'application a envoyé un mot
          // de passe, combien sont entrés. À ne pas confondre avec l'activation.
          taux_reussite: taux(n(socle.mdp_envoyes) - n(socle.bloques), n(socle.mdp_envoyes)),
        },
        pyramide: pyramide.map((p) => ({
          palier: p.palier,
          ordre: n(p.ordre),
          structures: n(p.structures),
          membres: n(p.membres),
        })),
        base: total,
      };
    });
  }

  /** Options de filtres : référentiels courts + racines de la cascade. */
  async filterOptions(perimeter: StatsPerimeter) {
    return this.cached('filters', {}, perimeter, async () => {
      const [departements, divisions, matrimonial] = await Promise.all([
        this.q('SELECT uuid, name FROM departments WHERE deleted_at IS NULL ORDER BY name'),
        this.q('SELECT uuid, name FROM divisions WHERE deleted_at IS NULL ORDER BY name'),
        this.q('SELECT uuid, name FROM marital_status WHERE deleted_at IS NULL ORDER BY name'),
      ]);

      // Points de départ de la cascade : les régions pour un administrateur, sa propre
      // racine de périmètre pour les autres. Le web descend ensuite via
      // `GET /structure/childrens/:uuid`, déjà ouvert à tout utilisateur authentifié -
      // inutile de recopier ici une navigation qui existe.
      let racines: any[] = [];
      if (perimeter.isAdmin) {
        const region = await this.palier('REGION');
        if (region) {
          racines = await this.q(
            `SELECT s.uuid, s.name, 'REGION' palier FROM structures s
              WHERE s.deleted_at IS NULL AND s.level_uuid = ? ORDER BY s.name`,
            [region.uuid],
          );
        }
      } else if ((perimeter.allowedRootUuids ?? []).length) {
        racines = await this.q(
          `SELECT s.uuid, s.name, l.name palier FROM structures s
             LEFT JOIN levels l ON l.uuid = s.level_uuid
            WHERE s.deleted_at IS NULL
              AND s.uuid IN (${perimeter.allowedRootUuids.map(() => '?').join(',')})`,
          perimeter.allowedRootUuids,
        );
      }

      return {
        departements,
        divisions,
        matrimonial,
        racines,
        tranches_age: AGE_BUCKETS.map(({ cle, libelle }) => ({ cle, libelle })),
        tranches_anciennete: ANCIENNETE_BUCKETS.map(({ cle, libelle }) => ({ cle, libelle })),
      };
    });
  }

  // =========================================================================
  // B - Démographie
  // =========================================================================

  async demography(filters: MemberFilters, perimeter: StatsPerimeter) {
    return this.cached('demography', filters, perimeter, async () => {
      const w = buildMemberWhere(filters, perimeter);

      const departements = await this.q(`
        SELECT COALESCE(d.name, 'Non renseigné') libelle, d.uuid, COUNT(*) n
          FROM members m
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
          LEFT JOIN departments d ON d.uuid = m.department_uuid
         WHERE m.deleted_at IS NULL ${w.sql}
         GROUP BY d.uuid, d.name ORDER BY n DESC`, w.params);

      const divisions = await this.q(`
        SELECT COALESCE(v.name, 'Non renseignée') libelle, v.uuid, COUNT(*) n
          FROM members m
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
          LEFT JOIN divisions v ON v.uuid = m.division_uuid
         WHERE m.deleted_at IS NULL ${w.sql}
         GROUP BY v.uuid, v.name ORDER BY n DESC`, w.params);

      // Pyramide des âges : une ligne par tranche, ventilée par genre (l'écran l'affiche
      // en miroir). `non_renseigne` inclut les dates aberrantes - elles sont recomptées
      // à part pour que l'écran puisse les nommer plutôt que de les noyer.
      const tranches = await this.q(`
        SELECT ${bucketCase(AGE_EXPR, AGE_PLAUSIBLE, AGE_BUCKETS)} cle,
               SUM(m.gender = 'homme') hommes,
               SUM(m.gender = 'femme') femmes,
               COUNT(*) total
          ${FROM_MEMBRES} ${w.sql}
         GROUP BY cle`, w.params);

      // Ce qui manque, nommé : une date absente et une date aberrante ne se corrigent pas
      // de la même façon, l'écran doit pouvoir les distinguer.
      const ageStats = await this.q1(`
        SELECT SUM(m.birth_date IS NULL) sans_date,
               SUM(m.birth_date IS NOT NULL AND NOT (${AGE_PLAUSIBLE})) aberrants
          ${FROM_MEMBRES} ${w.sql}`, w.params);

      // ⚠️ AVG dans une requête SÉPARÉE, gardée par AGE_PLAUSIBLE : mêlée à la précédente,
      // la moyenne intégrerait les naissances en 0199 et se décalerait de plusieurs années.
      const ageMoyen = await this.q1(`
        SELECT ROUND(AVG(${AGE_EXPR}), 1) moyenne, COUNT(*) base
          ${FROM_MEMBRES} ${w.sql} AND ${AGE_PLAUSIBLE}`, w.params);

      const matrimonial = await this.q(`
        SELECT COALESCE(ms.name, 'Non renseignée') libelle, COUNT(*) n
          FROM members m
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
          LEFT JOIN marital_status ms ON ms.uuid = m.marital_status_uuid
         WHERE m.deleted_at IS NULL ${w.sql}
         GROUP BY ms.uuid, ms.name ORDER BY n DESC`, w.params);

      const foyers = await this.q1(`
        SELECT COUNT(*) base,
               SUM(m.childrens > 0) avec_enfants,
               ROUND(AVG(m.childrens), 2) enfants_moyenne,
               SUM(m.spouse_member = 1) conjoint_membre
          ${FROM_MEMBRES} ${w.sql}`, w.params);

      // Profession : `job` quand il est là, sinon `formation` - les DEUX champs contiennent
      // des professions en saisie libre (héritage), et se limiter au premier perdrait la
      // moitié de la population. Le regroupement s'appuie sur la collation
      // `utf8mb4_unicode_ci` des référentiels, qui rend « Commerçant » et « COMMERCANT »
      // égaux : sans elle, chaque variante ferait sa propre part de camembert.
      const professions = await this.q(`
        SELECT COALESCE(j.name, f.name) libelle, COUNT(*) n
          FROM members m
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
          LEFT JOIN jobs j ON j.uuid = m.job_uuid
          LEFT JOIN formations f ON f.uuid = m.formation_uuid
         WHERE m.deleted_at IS NULL ${w.sql}
           AND COALESCE(j.name, f.name) IS NOT NULL AND COALESCE(j.name, f.name) <> ''
         GROUP BY libelle ORDER BY n DESC LIMIT 15`, w.params);

      const professionsBase = await this.q1(`
        SELECT COUNT(*) renseignes
          FROM members m
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
          LEFT JOIN jobs j ON j.uuid = m.job_uuid
          LEFT JOIN formations f ON f.uuid = m.formation_uuid
         WHERE m.deleted_at IS NULL ${w.sql}
           AND COALESCE(j.name, f.name) IS NOT NULL AND COALESCE(j.name, f.name) <> ''`, w.params);

      const villes = await this.q(`
        SELECT COALESCE(c.name, 'Non renseignée') libelle, COUNT(*) n
          FROM members m
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
          LEFT JOIN cities c ON c.uuid = m.city_uuid
         WHERE m.deleted_at IS NULL ${w.sql}
         GROUP BY c.uuid, c.name ORDER BY n DESC LIMIT 12`, w.params);

      const total = n(foyers.base);
      const parCle = new Map(tranches.map((t: any) => [t.cle, t]));
      return {
        genre: await this.genre(w),
        departements: departements.map((d: any) => ({ ...d, n: n(d.n), taux: taux(n(d.n), total) })),
        divisions: divisions.map((d: any) => ({ ...d, n: n(d.n), taux: taux(n(d.n), total) })),
        ages: {
          tranches: [...AGE_BUCKETS, { cle: 'non_renseigne', libelle: 'Non renseigné' }].map((b) => {
            const r: any = parCle.get(b.cle) ?? {};
            return {
              cle: b.cle,
              libelle: b.libelle,
              hommes: n(r.hommes),
              femmes: n(r.femmes),
              total: n(r.total),
            };
          }),
          moyenne: ageMoyen.moyenne === null ? null : Number(ageMoyen.moyenne),
          renseignes: n(ageMoyen.base),
          sans_date: n(ageStats.sans_date),
          aberrants: n(ageStats.aberrants),
        },
        matrimonial: matrimonial.map((r: any) => ({ ...r, n: n(r.n), taux: taux(n(r.n), total) })),
        foyers: {
          base: total,
          avec_enfants: n(foyers.avec_enfants),
          taux_avec_enfants: taux(n(foyers.avec_enfants), total),
          enfants_moyenne: foyers.enfants_moyenne === null ? 0 : Number(foyers.enfants_moyenne),
          conjoint_membre: n(foyers.conjoint_membre),
          taux_conjoint_membre: taux(n(foyers.conjoint_membre), total),
        },
        professions: {
          renseignes: n(professionsBase.renseignes),
          base: total,
          top: professions.map((p: any) => ({ libelle: p.libelle, n: n(p.n) })),
        },
        villes: villes.map((v: any) => ({ ...v, n: n(v.n) })),
      };
    });
  }

  private async genre(w: { sql: string; params: any[] }) {
    const rows = await this.q(`
      SELECT COALESCE(NULLIF(m.gender, ''), 'non_renseigne') cle, COUNT(*) n
        ${FROM_MEMBRES} ${w.sql}
       GROUP BY cle ORDER BY n DESC`, w.params);
    return rows.map((r: any) => ({ cle: r.cle, n: n(r.n) }));
  }

  // =========================================================================
  // C - Pratique religieuse & ancienneté
  // =========================================================================

  async practice(filters: MemberFilters, perimeter: StatsPerimeter) {
    return this.cached('practice', filters, perimeter, async () => {
      const w = buildMemberWhere(filters, perimeter);

      const possessions = await this.q1(`
        SELECT COUNT(*) base,
               SUM(m.has_gohonzon = 1) gohonzon,
               SUM(m.has_tokusso = 1) tokusso,
               SUM(m.has_omamori = 1) omamori,
               SUM(m.sokahan_byakuren = 1) sokahan,
               SUM(m.date_gohonzon IS NOT NULL) avec_date_gohonzon
          ${FROM_MEMBRES} ${w.sql}`, w.params);

      // Délai adhésion → Gohonzon. Les deux dates doivent être plausibles ET dans le bon
      // ordre : 473 membres portent un Gohonzon ANTÉRIEUR à leur adhésion (au 2026-08-19).
      // Les inclure donnerait un délai moyen négatif ; les taire ferait croire à une
      // mesure propre. On les exclut du calcul et on les compte à côté.
      const delai = await this.q1(`
        SELECT ROUND(AVG(DATEDIFF(m.date_gohonzon, m.membership_date) / 365.25), 1) moyenne_ans,
               COUNT(*) calculables
          ${FROM_MEMBRES} ${w.sql}
           AND ${ADHESION_PLAUSIBLE}
           AND m.date_gohonzon IS NOT NULL
           AND YEAR(m.date_gohonzon) BETWEEN 1960 AND YEAR(CURDATE())
           AND m.date_gohonzon >= m.membership_date`, w.params);

      const incoherents = await this.q1(`
        SELECT COUNT(*) n
          ${FROM_MEMBRES} ${w.sql}
           AND m.date_gohonzon IS NOT NULL AND m.membership_date IS NOT NULL
           AND m.date_gohonzon < m.membership_date`, w.params);

      const adhesionsParAnnee = await this.q(`
        SELECT YEAR(m.membership_date) annee, COUNT(*) n
          ${FROM_MEMBRES} ${w.sql} AND ${ADHESION_PLAUSIBLE}
         GROUP BY annee ORDER BY annee`, w.params);

      const gohonzonParAnnee = await this.q(`
        SELECT YEAR(m.date_gohonzon) annee, COUNT(*) n
          ${FROM_MEMBRES} ${w.sql}
           AND m.date_gohonzon IS NOT NULL
           AND YEAR(m.date_gohonzon) BETWEEN 1960 AND YEAR(CURDATE())
         GROUP BY annee ORDER BY annee`, w.params);

      // C10 - l'indicateur central : le taux de Gohonzon PAR cohorte d'ancienneté.
      // Il répond à « au bout de combien d'années nos membres reçoivent-ils le Gohonzon,
      // et est-ce que ça s'améliore ? », qu'aucun compteur ne peut dire.
      const cohortes = await this.q(`
        SELECT ${bucketCase(ANCIENNETE_EXPR, ADHESION_PLAUSIBLE, ANCIENNETE_BUCKETS)} cle,
               COUNT(*) membres,
               SUM(m.has_gohonzon = 1) avec_gohonzon
          ${FROM_MEMBRES} ${w.sql}
         GROUP BY cle`, w.params);

      const anciennete = await this.q1(`
        SELECT ROUND(AVG(${ANCIENNETE_EXPR}), 1) moyenne_ans,
               COUNT(*) base,
               SUM(${ANCIENNETE_EXPR} <= 5) adhesions_5ans
          ${FROM_MEMBRES} ${w.sql} AND ${ADHESION_PLAUSIBLE}`, w.params);

      const base = n(possessions.base);
      const parCohorte = new Map(cohortes.map((c: any) => [c.cle, c]));
      return {
        base,
        possessions: {
          gohonzon: n(possessions.gohonzon),
          taux_gohonzon: taux(n(possessions.gohonzon), base),
          tokusso: n(possessions.tokusso),
          taux_tokusso: taux(n(possessions.tokusso), base),
          omamori: n(possessions.omamori),
          taux_omamori: taux(n(possessions.omamori), base),
          sokahan: n(possessions.sokahan),
          taux_sokahan: taux(n(possessions.sokahan), base),
          avec_date_gohonzon: n(possessions.avec_date_gohonzon),
        },
        delai_gohonzon: {
          moyenne_ans: delai.moyenne_ans === null ? null : Number(delai.moyenne_ans),
          calculables: n(delai.calculables),
          incoherents: n(incoherents.n),
        },
        adhesions_par_annee: adhesionsParAnnee.map((r: any) => ({
          annee: n(r.annee),
          n: n(r.n),
        })),
        gohonzon_par_annee: gohonzonParAnnee.map((r: any) => ({
          annee: n(r.annee),
          n: n(r.n),
        })),
        cohortes: [...ANCIENNETE_BUCKETS, { cle: 'non_renseigne', libelle: 'Non renseignée' }].map(
          (b) => {
            const r: any = parCohorte.get(b.cle) ?? {};
            return {
              cle: b.cle,
              libelle: b.libelle,
              membres: n(r.membres),
              avec_gohonzon: n(r.avec_gohonzon),
              taux_gohonzon: taux(n(r.avec_gohonzon), n(r.membres)),
            };
          },
        ),
        anciennete: {
          moyenne_ans: anciennete.moyenne_ans === null ? null : Number(anciennete.moyenne_ans),
          base: n(anciennete.base),
          adhesions_5ans: n(anciennete.adhesions_5ans),
          taux_renouvellement: taux(n(anciennete.adhesions_5ans), n(anciennete.base)),
        },
      };
    });
  }

  // =========================================================================
  // D - Encadrement & vitalité
  // =========================================================================

  async vitality(filters: MemberFilters, perimeter: StatsPerimeter) {
    return this.cached('vitality', filters, perimeter, async () => {
      const w = buildMemberWhere(filters, perimeter);

      // Même principe que la participation : la liste des membres porteurs d'un mandat est
      // matérialisée une fois, puis jointe.
      const encadrement = await this.q1(`
        SELECT COUNT(*) base,
               SUM(rr.member_uuid IS NOT NULL) responsables,
               SUM(m.gender = 'femme' AND rr.member_uuid IS NOT NULL) femmes_responsables,
               SUM(m.gender = 'femme') femmes
          FROM members m
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
          LEFT JOIN (
            SELECT DISTINCT mr.member_uuid FROM member_responsibilities mr
             WHERE mr.deleted_at IS NULL
          ) rr ON rr.member_uuid = m.uuid
         WHERE m.deleted_at IS NULL ${w.sql}`, w.params);

      const mandats = await this.q1(`
        SELECT COUNT(*) total
          FROM member_responsibilities mr
          JOIN members m ON m.uuid = mr.member_uuid AND m.deleted_at IS NULL
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
         WHERE mr.deleted_at IS NULL ${w.sql}`, w.params);

      const multi = await this.q1(`
        SELECT COUNT(*) n FROM (
          SELECT mr.member_uuid
            FROM member_responsibilities mr
            JOIN members m ON m.uuid = mr.member_uuid AND m.deleted_at IS NULL
            LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
           WHERE mr.deleted_at IS NULL ${w.sql}
           GROUP BY mr.member_uuid HAVING COUNT(*) > 1
        ) t`, w.params);

      const parMandat = await this.q(`
        SELECT r.name libelle, COUNT(*) n
          FROM member_responsibilities mr
          JOIN responsibilities r ON r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL
          JOIN members m ON m.uuid = mr.member_uuid AND m.deleted_at IS NULL
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
         WHERE mr.deleted_at IS NULL ${w.sql}
         GROUP BY r.uuid, r.name ORDER BY n DESC LIMIT 15`, w.params);

      const ages = await this.q1(`
        SELECT ROUND(AVG(CASE WHEN rr.member_uuid IS NOT NULL THEN ${AGE_EXPR} END), 1) age_responsables,
               ROUND(AVG(${AGE_EXPR}), 1) age_membres
          FROM members m
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
          LEFT JOIN (
            SELECT DISTINCT mr.member_uuid FROM member_responsibilities mr
             WHERE mr.deleted_at IS NULL
          ) rr ON rr.member_uuid = m.uuid
         WHERE m.deleted_at IS NULL ${w.sql} AND ${AGE_PLAUSIBLE}`, w.params);

      const sousGroupes = await this.sousGroupes(filters, perimeter);
      const paliers = await this.couvertureResponsables(filters, perimeter);

      const base = n(encadrement.base);
      const responsables = n(encadrement.responsables);
      return {
        base,
        encadrement: {
          responsables,
          taux: taux(responsables, base),
          mandats: n(mandats.total),
          multi_mandats: n(multi.n),
          // Combien de membres pour un responsable. `null` plutôt que ∞ quand il n'y en a
          // aucun : l'écran doit écrire « aucun responsable », pas afficher un infini.
          membres_par_responsable:
            responsables > 0 ? Math.round((base / responsables) * 10) / 10 : null,
        },
        feminisation: {
          femmes_responsables: n(encadrement.femmes_responsables),
          taux_femmes_encadrement: taux(n(encadrement.femmes_responsables), responsables),
          taux_femmes_membres: taux(n(encadrement.femmes), base),
          // Négatif = les femmes sont sous-représentées dans l'encadrement.
          ecart:
            Math.round(
              (taux(n(encadrement.femmes_responsables), responsables) -
                taux(n(encadrement.femmes), base)) * 10,
            ) / 10,
        },
        ages: {
          responsables: ages.age_responsables === null ? null : Number(ages.age_responsables),
          membres: ages.age_membres === null ? null : Number(ages.age_membres),
        },
        mandats: parMandat.map((r: any) => ({ libelle: r.libelle, n: n(r.n) })),
        sous_groupes: sousGroupes,
        paliers: paliers,
      };
    });
  }

  /**
   * Santé du maillage au dernier palier. Le sous-groupe est la maille de rattachement réelle
   * (7 978 membres sur 8 033) : c'est là que « l'organisation tient debout » se mesure.
   *
   * ⚠️ Les filtres démographiques ne s'appliquent PAS ici : un sous-groupe n'a pas de genre
   * ni d'âge. Seul le périmètre (et la structure choisie) borne la population - sinon
   * « sous-groupes vides » varierait en filtrant sur les femmes, ce qui n'a aucun sens.
   */
  private async sousGroupes(filters: MemberFilters, perimeter: StatsPerimeter) {
    const sg = await this.palier('SOUS_GROUPE');
    if (!sg) return null;

    const bornes: string[] = [];
    const params: any[] = [sg.uuid];
    if (!perimeter.isAdmin) {
      const racines = (perimeter.allowedRootUuids ?? []).filter(Boolean);
      if (racines.length === 0) bornes.push('1 = 0');
      else {
        bornes.push(
          `s.uuid IN (SELECT sc.descendant_uuid FROM structure_closure sc
                       WHERE sc.ancestor_uuid IN (${racines.map(() => '?').join(',')}))`,
        );
        params.push(...racines);
      }
    }
    if (filters.structure_uuid) {
      bornes.push(
        `s.uuid IN (SELECT sc2.descendant_uuid FROM structure_closure sc2
                     WHERE sc2.ancestor_uuid = ?)`,
      );
      params.push(filters.structure_uuid);
    }
    const where = bornes.length ? ` AND ${bornes.join(' AND ')}` : '';

    const r = await this.q1(`
      SELECT COUNT(*) total,
             SUM(t.membres = 0) vides,
             SUM(t.membres BETWEEN 1 AND 2) tres_petits,
             SUM(t.membres > 10) surcharges,
             ROUND(AVG(t.membres), 1) taille_moyenne,
             MAX(t.membres) plus_grand
        FROM (
          SELECT s.uuid, COUNT(mm.id) membres
            FROM structures s
            LEFT JOIN members mm ON mm.structure_uuid = s.uuid AND mm.deleted_at IS NULL
           WHERE s.deleted_at IS NULL AND s.level_uuid = ?${where}
           GROUP BY s.uuid
        ) t`, params);

    return {
      total: n(r.total),
      vides: n(r.vides),
      tres_petits: n(r.tres_petits),
      surcharges: n(r.surcharges),
      taille_moyenne: r.taille_moyenne === null ? 0 : Number(r.taille_moyenne),
      plus_grand: n(r.plus_grand),
    };
  }

  /**
   * **Couverture des responsables, palier par palier** - l'indicateur le plus fort du module.
   *
   * Définition retenue : une structure de palier L **a un responsable** si l'un des membres
   * de son sous-arbre porte un mandat **typé au palier L** (`responsibilities.level_uuid`).
   * Se contenter de « un membre porte un mandat quelconque » compterait un sous-groupe comme
   * encadré parce qu'un responsable de district y est rattaché - la couverture passerait de
   * 36 % à 71 % sans qu'aucun sous-groupe n'ait gagné de responsable.
   *
   * ⚠️ **`member_responsibilities` ne porte pas la structure dirigée**, seulement le membre et
   * l'intitulé du mandat. On impute donc le mandat à l'ancêtre du bon palier de la structure
   * de rattachement du responsable. Juste dans l'écrasante majorité des cas, faux si quelqu'un
   * dirige une structure dont il n'est pas membre. C'est écrit à l'écran.
   *
   * ⚠️ Un palier où le référentiel ne définit **aucun** mandat (CENTRE_REGIONAL aujourd'hui)
   * sortirait à 0 % : il est marqué `sans_objet` plutôt que compté comme une défaillance.
   *
   * 🚨 **Aucune sous-requête corrélée dans le SELECT** : la version qui en contenait deux
   * mettait **81 secondes** (MySQL les évalue par ligne intermédiaire du GROUP BY, pas par
   * groupe). La même requête sans elles : **0,5 s**. Les comptages de structures sont donc
   * faits à part, puis rapprochés en TypeScript.
   */
  private async couvertureResponsables(filters: MemberFilters, perimeter: StatsPerimeter) {
    const bornes: string[] = [];
    const params: any[] = [];
    if (!perimeter.isAdmin) {
      const racines = (perimeter.allowedRootUuids ?? []).filter(Boolean);
      if (racines.length === 0) bornes.push('1 = 0');
      else {
        bornes.push(
          `anc.uuid IN (SELECT sc3.descendant_uuid FROM structure_closure sc3
                         WHERE sc3.ancestor_uuid IN (${racines.map(() => '?').join(',')}))`,
        );
        params.push(...racines);
      }
    }
    if (filters.structure_uuid) {
      bornes.push(
        `anc.uuid IN (SELECT sc4.descendant_uuid FROM structure_closure sc4
                       WHERE sc4.ancestor_uuid = ?)`,
      );
      params.push(filters.structure_uuid);
    }
    const filtreAnc = bornes.length ? ` AND ${bornes.join(' AND ')}` : '';

    const couverts = await this.q(`
      SELECT l.uuid level_uuid, COUNT(DISTINCT anc.uuid) avec_responsable
        FROM levels l
        LEFT JOIN responsibilities r ON r.level_uuid = l.uuid AND r.deleted_at IS NULL
        LEFT JOIN member_responsibilities mr
               ON mr.responsibility_uuid = r.uuid AND mr.deleted_at IS NULL
        LEFT JOIN members m ON m.uuid = mr.member_uuid AND m.deleted_at IS NULL
        LEFT JOIN structure_closure sc ON sc.descendant_uuid = m.structure_uuid
        LEFT JOIN structures anc
               ON anc.uuid = sc.ancestor_uuid AND anc.level_uuid = l.uuid
              AND anc.deleted_at IS NULL${filtreAnc}
       WHERE l.deleted_at IS NULL
       GROUP BY l.uuid`, params);

    // Comptages hors de la requête d'agrégation (voir l'avertissement ci-dessus).
    const structures = await this.q(`
      SELECT l.uuid level_uuid, l.name palier, l.\`order\` ordre,
             COUNT(DISTINCT s.uuid) structures,
             COUNT(DISTINCT r.uuid) mandats_definis
        FROM levels l
        LEFT JOIN structures s ON s.level_uuid = l.uuid AND s.deleted_at IS NULL
        LEFT JOIN responsibilities r ON r.level_uuid = l.uuid AND r.deleted_at IS NULL
       WHERE l.deleted_at IS NULL
       GROUP BY l.uuid, l.name, l.\`order\`
       ORDER BY l.\`order\``);

    const parLevel = new Map(couverts.map((c: any) => [c.level_uuid, n(c.avec_responsable)]));
    return structures.map((s: any) => {
      const total = n(s.structures);
      const avec = parLevel.get(s.level_uuid) ?? 0;
      const sansObjet = n(s.mandats_definis) === 0;
      return {
        palier: s.palier,
        ordre: n(s.ordre),
        structures: total,
        avec_responsable: sansObjet ? null : avec,
        sans_responsable: sansObjet ? null : Math.max(0, total - avec),
        taux_couverture: sansObjet ? null : taux(avec, total),
        // `true` = aucun mandat n'existe au catalogue pour ce palier : l'absence de
        // responsable n'y veut rien dire.
        sans_objet: sansObjet,
      };
    });
  }

  // =========================================================================
  // E - Adoption numérique
  // =========================================================================

  async adoption(filters: MemberFilters, perimeter: StatsPerimeter) {
    return this.cached('adoption', filters, perimeter, async () => {
      const w = buildMemberWhere(filters, perimeter);

      const comptes = await this.q1(`
        SELECT COUNT(*) membres,
               SUM(u.uuid IS NOT NULL) comptes,
               SUM(u.uuid IS NULL) sans_compte,
               SUM(u.is_sent = 1) mdp_envoyes,
               SUM(u.is_connected = 1) connectes,
               SUM(u.is_sent = 1 AND u.is_connected = 1) envoyes_et_connectes,
               SUM(u.is_sent = 1 AND (u.is_connected IS NULL OR u.is_connected <> 1)) bloques,
               SUM(u.must_change_password = 1) mdp_defaut,
               SUM((u.is_sent IS NULL OR u.is_sent <> 1) AND u.is_connected = 1) connectes_sans_sms,
               SUM(m.phone IS NOT NULL AND m.phone <> '') avec_telephone,
               SUM(m.phone_whatsapp IS NOT NULL AND m.phone_whatsapp <> '') avec_whatsapp,
               SUM(m.email IS NOT NULL AND m.email <> '') avec_email
          ${FROM_MEMBRES} ${w.sql}`, w.params);

      const parDepartement = await this.q(`
        SELECT COALESCE(d.name, 'Non renseigné') libelle,
               COUNT(*) membres,
               SUM(u.is_connected = 1) connectes
          FROM members m
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
          LEFT JOIN departments d ON d.uuid = m.department_uuid
         WHERE m.deleted_at IS NULL ${w.sql}
         GROUP BY d.uuid, d.name ORDER BY membres DESC`, w.params);

      // Participation aux campagnes : un membre BÉNÉFICIAIRE d'au moins un paiement abouti.
      // ⚠️ Frontière avec la Comptabilité : ici un TAUX de mobilisation, jamais un montant.
      // `subscription_payments.beneficiary_uuid` est en latin1 et `members.uuid` en utf8mb4 :
      // MySQL convertit (les deux jeux sont compatibles), la jointure est correcte mais ne
      // peut pas utiliser d'index - acceptable sur 2 358 lignes.
      // 🚨 Table DÉRIVÉE, jamais un `EXISTS` corrélé : la version corrélée mettait
      // **10,6 secondes** (une passe sur `subscription_payments` par membre, sans index
      // exploitable - la colonne est en latin1 face à un uuid utf8mb4). Ici la liste des
      // bénéficiaires est matérialisée UNE fois puis jointe : 0,3 s.
      const participation = await this.q1(`
        SELECT COUNT(*) base, SUM(p.beneficiary_uuid IS NOT NULL) participants
          FROM members m
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
          LEFT JOIN (
            SELECT DISTINCT sp.beneficiary_uuid
              FROM subscription_payments sp
             WHERE sp.status = 'success' AND sp.beneficiary_uuid IS NOT NULL
          ) p ON p.beneficiary_uuid = m.uuid
         WHERE m.deleted_at IS NULL ${w.sql}`, w.params);

      const journal = await this.journalConnexion(filters, perimeter);

      const membres = n(comptes.membres);
      const nbComptes = n(comptes.comptes);
      const envoyes = n(comptes.mdp_envoyes);
      return {
        base: membres,
        comptes: {
          membres,
          comptes: nbComptes,
          sans_compte: n(comptes.sans_compte),
        },
        // L'entonnoir, dans l'ordre où le membre le vit.
        entonnoir: [
          { etape: 'Compte créé', n: nbComptes },
          { etape: 'Mot de passe envoyé', n: envoyes },
          { etape: 'Connecté au moins une fois', n: n(comptes.connectes) },
        ],
        taux: {
          // Deux indicateurs que le mot « taux de connexion » confond. Les nommer
          // distinctement est une décision de conception, pas un détail de vocabulaire.
          activation: taux(n(comptes.connectes), nbComptes),
          reussite: taux(n(comptes.envoyes_et_connectes), envoyes),
        },
        alertes: {
          bloques: n(comptes.bloques),
          mdp_defaut: n(comptes.mdp_defaut),
          connectes_sans_sms: n(comptes.connectes_sans_sms),
        },
        joignabilite: {
          telephone: taux(n(comptes.avec_telephone), membres),
          whatsapp: taux(n(comptes.avec_whatsapp), membres),
          email: taux(n(comptes.avec_email), membres),
        },
        par_departement: parDepartement.map((r: any) => ({
          libelle: r.libelle,
          membres: n(r.membres),
          connectes: n(r.connectes),
          taux: taux(n(r.connectes), n(r.membres)),
        })),
        participation: {
          participants: n(participation.participants),
          base: n(participation.base),
          taux: taux(n(participation.participants), n(participation.base)),
        },
        journal,
      };
    });
  }

  /**
   * Indicateurs issus du **journal de connexion** (`login_logs`, ouvert le 2026-08-19).
   *
   * ⚠️ **Sans effet rétroactif** : `disponible_depuis` porte la date de la plus ancienne
   * ligne, et l'écran DOIT l'afficher. Un « 12 connexions sur 30 jours » sans préciser que
   * le journal a trois jours d'existence serait lu comme un effondrement de l'usage.
   *
   * Le périmètre s'applique via le membre du compte : un responsable ne voit l'activité que
   * de sa branche. Les tentatives sur un numéro INCONNU n'ont pas de compte, donc pas de
   * structure : elles ne sont comptées que pour l'administrateur (bloc sécurité).
   */
  private async journalConnexion(filters: MemberFilters, perimeter: StatsPerimeter) {
    const w = buildMemberWhere(filters, perimeter);

    const dispo = await this.q1(
      'SELECT MIN(created_at) depuis, COUNT(*) lignes FROM login_logs',
    );
    if (!n(dispo.lignes)) {
      return {
        disponible: false,
        depuis: null,
        connexions_30j: 0,
        membres_actifs_30j: 0,
        echecs_30j: 0,
        taux_echec_30j: 0,
        par_jour: [],
        par_heure: [],
        echecs_par_motif: [],
        ips_suspectes: [],
      };
    }

    const perim = `
      AND EXISTS (
        SELECT 1 FROM users uu
          JOIN members m ON m.uuid = uu.member_uuid AND m.deleted_at IS NULL
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
         WHERE uu.uuid = ll.user_uuid AND uu.deleted_at IS NULL ${w.sql}
      )`;

    const resume = await this.q1(`
      SELECT SUM(ll.outcome = 'success') connexions,
             COUNT(DISTINCT CASE WHEN ll.outcome = 'success' THEN ll.user_uuid END) actifs,
             SUM(ll.outcome IN ('bad_password','unknown_identifier','inactive_account')) echecs,
             COUNT(*) total
        FROM login_logs ll
       WHERE ll.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) ${perim}`, w.params);

    const parJour = await this.q(`
      SELECT DATE(ll.created_at) jour,
             SUM(ll.outcome = 'success') succes,
             SUM(ll.outcome IN ('bad_password','unknown_identifier','inactive_account')) echecs
        FROM login_logs ll
       WHERE ll.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) ${perim}
       GROUP BY jour ORDER BY jour`, w.params);

    const parHeure = await this.q(`
      SELECT HOUR(ll.created_at) heure, COUNT(*) n
        FROM login_logs ll
       WHERE ll.outcome = 'success'
         AND ll.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) ${perim}
       GROUP BY heure ORDER BY heure`, w.params);

    const motifs = await this.q(`
      SELECT ll.outcome motif, COUNT(*) n
        FROM login_logs ll
       WHERE ll.outcome <> 'success'
         AND ll.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) ${perim}
       GROUP BY ll.outcome ORDER BY n DESC`, w.params);

    // Bloc sécurité : réservé à l'administrateur. Une IP qui échoue sur PLUSIEURS comptes
    // est la signature d'un balayage - ce que 10 000 mots de passe possibles rendent
    // trivial (dette du 2026-08-02). Ce n'est pas une information de gouvernance : elle
    // n'est pas bornée par le périmètre, donc elle ne sort pas pour un responsable.
    const ips = perimeter.isAdmin
      ? await this.q(`
          SELECT ll.ip,
                 COUNT(*) echecs,
                 COUNT(DISTINCT ll.identifier) comptes_vises
            FROM login_logs ll
           WHERE ll.outcome IN ('bad_password','unknown_identifier')
             AND ll.ip IS NOT NULL
             AND ll.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
           GROUP BY ll.ip
          HAVING echecs >= 10 AND comptes_vises >= 3
           ORDER BY echecs DESC LIMIT 10`)
      : [];

    const echecs = n(resume.echecs);
    return {
      disponible: true,
      depuis: dispo.depuis,
      connexions_30j: n(resume.connexions),
      membres_actifs_30j: n(resume.actifs),
      echecs_30j: echecs,
      taux_echec_30j: taux(echecs, n(resume.total)),
      par_jour: parJour.map((r: any) => ({
        jour: r.jour,
        succes: n(r.succes),
        echecs: n(r.echecs),
      })),
      par_heure: parHeure.map((r: any) => ({ heure: n(r.heure), n: n(r.n) })),
      echecs_par_motif: motifs.map((r: any) => ({ motif: r.motif, n: n(r.n) })),
      ips_suspectes: ips.map((r: any) => ({
        ip: r.ip,
        echecs: n(r.echecs),
        comptes_vises: n(r.comptes_vises),
      })),
    };
  }

  // =========================================================================
  // F - Qualité des données
  // =========================================================================

  /** Champs entrant dans l'indice de complétude, avec leur poids. */
  private static readonly CHAMPS_COMPLETUDE: Array<{
    cle: string;
    libelle: string;
    test: string;
    poids: number;
  }> = [
    { cle: 'genre', libelle: 'Genre', test: "m.gender IS NOT NULL AND m.gender <> ''", poids: 1 },
    { cle: 'naissance', libelle: 'Date de naissance', test: AGE_PLAUSIBLE, poids: 2 },
    { cle: 'adhesion', libelle: "Date d'adhésion", test: ADHESION_PLAUSIBLE, poids: 2 },
    { cle: 'telephone', libelle: 'Téléphone', test: "m.phone IS NOT NULL AND m.phone <> ''", poids: 2 },
    { cle: 'whatsapp', libelle: 'WhatsApp', test: "m.phone_whatsapp IS NOT NULL AND m.phone_whatsapp <> ''", poids: 1 },
    { cle: 'email', libelle: 'E-mail', test: "m.email IS NOT NULL AND m.email <> ''", poids: 1 },
    { cle: 'structure', libelle: 'Structure', test: 'm.structure_uuid IS NOT NULL', poids: 2 },
    { cle: 'departement', libelle: 'Département', test: 'm.department_uuid IS NOT NULL', poids: 2 },
    { cle: 'civilite', libelle: 'Civilité', test: 'm.civility_uuid IS NOT NULL', poids: 1 },
    { cle: 'matrimonial', libelle: 'Situation matrimoniale', test: 'm.marital_status_uuid IS NOT NULL', poids: 1 },
    { cle: 'ville', libelle: 'Ville', test: 'm.city_uuid IS NOT NULL', poids: 1 },
    { cle: 'matricule', libelle: 'Matricule', test: "m.matricule IS NOT NULL AND m.matricule <> ''", poids: 1 },
  ];

  async quality(filters: MemberFilters, perimeter: StatsPerimeter) {
    return this.cached('quality', filters, perimeter, async () => {
      const w = buildMemberWhere(filters, perimeter);
      const champs = StatisticsService.CHAMPS_COMPLETUDE;
      const poidsTotal = champs.reduce((s, c) => s + c.poids, 0);

      const couverture = await this.q1(`
        SELECT COUNT(*) base,
               ${champs.map((c) => `SUM(${c.test}) ${c.cle}`).join(',\n               ')},
               ROUND(AVG((${champs.map((c) => `(${c.test}) * ${c.poids}`).join(' + ')}) * 100 / ${poidsTotal}), 1) score
          ${FROM_MEMBRES} ${w.sql}`, w.params);

      // Incohérences : chacune est un compteur ET une liste actionnable côté écran.
      const incoherences = await this.q1(`
        SELECT SUM(m.gender = 'homme' AND d.name = 'FEMME')  homme_en_departement_femme,
               SUM(m.gender = 'femme' AND d.name = 'HOMME')  femme_en_departement_homme,
               SUM(d.name <> 'JEUNESSE' AND m.division_uuid IS NOT NULL) division_hors_jeunesse,
               SUM(d.name = 'JEUNESSE' AND m.division_uuid IS NULL) jeunesse_sans_division,
               SUM(m.department_uuid IS NULL) sans_departement,
               SUM(m.birth_date IS NOT NULL AND NOT (${AGE_PLAUSIBLE})) naissance_aberrante,
               SUM(m.membership_date IS NOT NULL AND NOT (${ADHESION_PLAUSIBLE})) adhesion_aberrante,
               SUM(m.membership_date IS NOT NULL AND m.birth_date IS NOT NULL
                   AND m.membership_date < m.birth_date) adhesion_avant_naissance,
               SUM(m.date_gohonzon IS NOT NULL AND m.membership_date IS NOT NULL
                   AND m.date_gohonzon < m.membership_date) gohonzon_avant_adhesion,
               SUM(u.uuid IS NULL) sans_compte,
               SUM(m.structure_uuid IS NOT NULL
                   AND NOT EXISTS (SELECT 1 FROM structure_closure sc
                                    WHERE sc.descendant_uuid = m.structure_uuid)) hors_arbre
          FROM members m
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
          LEFT JOIN departments d ON d.uuid = m.department_uuid
         WHERE m.deleted_at IS NULL ${w.sql}`, w.params);

      const mauvaisPalier = await this.mauvaisPalier(filters, perimeter);
      const doublons = await this.doublons(w);
      const pires = await this.completudeParDistrict(filters, perimeter, champs, poidsTotal);

      const base = n(couverture.base);
      return {
        base,
        completude: {
          score_moyen: couverture.score === null ? 0 : Number(couverture.score),
          champs: champs.map((c) => ({
            cle: c.cle,
            libelle: c.libelle,
            poids: c.poids,
            renseignes: n((couverture as any)[c.cle]),
            taux: taux(n((couverture as any)[c.cle]), base),
          })),
          pires_structures: pires,
        },
        incoherences: [
          { cle: 'homme_en_departement_femme', libelle: 'Hommes rattachés au département FEMME', n: n(incoherences.homme_en_departement_femme) },
          { cle: 'femme_en_departement_homme', libelle: 'Femmes rattachées au département HOMME', n: n(incoherences.femme_en_departement_homme) },
          { cle: 'division_hors_jeunesse', libelle: 'Division jeunesse portée hors du département JEUNESSE', n: n(incoherences.division_hors_jeunesse) },
          { cle: 'jeunesse_sans_division', libelle: 'Membres JEUNESSE sans division', n: n(incoherences.jeunesse_sans_division) },
          { cle: 'sans_departement', libelle: 'Membres sans département', n: n(incoherences.sans_departement) },
          { cle: 'naissance_aberrante', libelle: 'Dates de naissance invraisemblables', n: n(incoherences.naissance_aberrante) },
          { cle: 'adhesion_aberrante', libelle: "Dates d'adhésion invraisemblables", n: n(incoherences.adhesion_aberrante) },
          { cle: 'adhesion_avant_naissance', libelle: 'Adhésions antérieures à la naissance', n: n(incoherences.adhesion_avant_naissance) },
          { cle: 'gohonzon_avant_adhesion', libelle: "Gohonzon antérieur à l'adhésion", n: n(incoherences.gohonzon_avant_adhesion) },
          { cle: 'sans_compte', libelle: 'Membres sans compte de connexion', n: n(incoherences.sans_compte) },
          { cle: 'hors_arbre', libelle: "Membres rattachés à une structure absente de l'arbre", n: n(incoherences.hors_arbre) },
          { cle: 'mauvais_palier', libelle: 'Membres rattachés ailleurs qu’à un sous-groupe', n: mauvaisPalier },
        ].sort((a, b) => b.n - a.n),
        doublons,
      };
    });
  }

  /** Membres rattachés à une structure qui n'est pas un sous-groupe (55 au 2026-08-19). */
  private async mauvaisPalier(filters: MemberFilters, perimeter: StatsPerimeter): Promise<number> {
    const sg = await this.palier('SOUS_GROUPE');
    if (!sg) return 0;
    const w = buildMemberWhere(filters, perimeter);
    const r = await this.q1(`
      SELECT COUNT(*) n
        FROM members m
        LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
        JOIN structures s ON s.uuid = m.structure_uuid
       WHERE m.deleted_at IS NULL AND s.level_uuid <> ? ${w.sql}`, [sg.uuid, ...w.params]);
    return n(r.n);
  }

  /**
   * Complétude agrégée au DISTRICT. C'est la maille où quelqu'un peut agir : un responsable
   * de district sait quoi faire de « votre district est à 61/100 », personne ne sait quoi
   * faire d'un taux national. La remontée passe par `structure_closure`.
   */
  private async completudeParDistrict(
    filters: MemberFilters,
    perimeter: StatsPerimeter,
    champs: Array<{ test: string; poids: number }>,
    poidsTotal: number,
  ) {
    const district = await this.palier('DISTRICT');
    if (!district) return [];
    const w = buildMemberWhere(filters, perimeter);
    const score = `(${champs.map((c) => `(${c.test}) * ${c.poids}`).join(' + ')}) * 100 / ${poidsTotal}`;

    return (
      await this.q(`
        SELECT a.uuid, a.name libelle, COUNT(*) membres, ROUND(AVG(${score}), 1) score
          FROM members m
          LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
          JOIN structure_closure sc ON sc.descendant_uuid = m.structure_uuid
          JOIN structures a ON a.uuid = sc.ancestor_uuid AND a.level_uuid = ? AND a.deleted_at IS NULL
         WHERE m.deleted_at IS NULL ${w.sql}
         GROUP BY a.uuid, a.name
        HAVING membres >= 5
         ORDER BY score ASC LIMIT 10`, [district.uuid, ...w.params])
    ).map((r: any) => ({
      uuid: r.uuid,
      libelle: r.libelle,
      membres: n(r.membres),
      score: r.score === null ? 0 : Number(r.score),
    }));
  }

  /** Doublons potentiels - signalés, jamais corrigés (décision du 2026-08-19). */
  private async doublons(w: { sql: string; params: any[] }) {
    const telephones = await this.q1(`
      SELECT COUNT(*) n FROM (
        SELECT m.phone ${FROM_MEMBRES} ${w.sql}
           AND m.phone IS NOT NULL AND m.phone <> ''
         GROUP BY m.phone HAVING COUNT(*) > 1) t`, w.params);

    const homonymes = await this.q1(`
      SELECT COUNT(*) n FROM (
        SELECT m.lastname, m.firstname, m.birth_date ${FROM_MEMBRES} ${w.sql}
           AND m.birth_date IS NOT NULL
         GROUP BY m.lastname, m.firstname, m.birth_date HAVING COUNT(*) > 1) t`, w.params);

    const matricules = await this.q1(`
      SELECT COUNT(*) n FROM (
        SELECT m.matricule ${FROM_MEMBRES} ${w.sql}
           AND m.matricule IS NOT NULL AND m.matricule <> ''
         GROUP BY m.matricule HAVING COUNT(*) > 1) t`, w.params);

    return {
      telephones_partages: n(telephones.n),
      homonymes_meme_naissance: n(homonymes.n),
      matricules_dupliques: n(matricules.n),
    };
  }
}
