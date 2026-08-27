import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../shared/decorators/public.decorator';
import { EffectifsAbonnementsService } from './effectifs-abonnements.service';

/**
 * **Rapport public d'effectifs et d'abonnements** - un lien, une clé, du JSON brut.
 *
 * 🚨 **Route `@Public()` : elle n'est protégée QUE par la clé du `.env`
 * (`RAPPORT_PUBLIC_KEY`).** Le contrôle vit dans `EffectifsAbonnementsService.assertCle`, avec
 * ses trois règles : clé non configurée ⇒ 404 (une variable oubliée ne doit pas publier les
 * effectifs), comparaison en temps constant, et **404 sur clé fausse** - un 403 confirmerait
 * que l'URL existe.
 *
 * ⚠️ **Cette route n'est appelée par AUCUN écran** et ne doit pas l'être : elle est faite pour
 * être ouverte à la main dans un navigateur. Ne pas la brancher dans `web/services/`.
 *
 * ⚠️ **`@Res()` est volontaire** : il court-circuite le `ResponseInterceptor` global, donc la
 * réponse n'est PAS enveloppée dans `{success, message, data}`. C'est ce qui rend le JSON
 * « brut », lisible et copiable tel quel. Ne pas retourner l'objet à la place, l'enveloppe
 * reviendrait.
 *
 * ⚠️ `@ApiExcludeController` : inutile d'annoncer dans Swagger une porte dérobée dont l'intérêt
 * est de ne pas s'annoncer.
 */
@ApiExcludeController()
@Controller('rapports')
export class ReportsController {
  constructor(private readonly effectifs: EffectifsAbonnementsService) {}

  @Public()
  @Get('effectifs-abonnements')
  async effectifsAbonnements(
    @Res() res: Response,
    @Query('cle') cle?: string,
    @Query('campagne') campagne?: string,
  ) {
    this.effectifs.assertCle(cle);
    const rapport = await this.effectifs.rapport(campagne?.trim() || undefined);

    // `Cache-Control` : un rapport d'effectifs ne doit pas être mis en cache par un proxy,
    // l'URL portant la clé.
    res.setHeader('Cache-Control', 'no-store');
    res.json(rapport);
  }
}
