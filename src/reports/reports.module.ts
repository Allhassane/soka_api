import { Module } from '@nestjs/common';
import { EffectifsAbonnementsService } from './effectifs-abonnements.service';
import { ReportsController } from './reports.controller';

/**
 * Rapports publics servis par lien à clé.
 *
 * 🚨 Module **volontairement isolé** : il ne contient que des routes `@Public()`. Les mêler à
 * un module gardé ferait croire, à la lecture, que tout y est protégé. Ici, l'ouverture est
 * l'affaire du fichier entier - et se voit au premier coup d'œil.
 *
 * Aucune entité déclarée : le service interroge en SQL brut via le `DataSource` (remontée
 * récursive de l'arbre des structures, cf. son commentaire sur `structure_closure`).
 */
@Module({
  controllers: [ReportsController],
  providers: [EffectifsAbonnementsService],
})
export class ReportsModule {}
