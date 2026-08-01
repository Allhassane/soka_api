import { SetMetadata } from '@nestjs/common';

export const REFERENTIAL_READ_KEY = 'referential_read';

/**
 * Marque une route de LECTURE d'un référentiel (nomenclature sans donnée personnelle :
 * civilités, pays, formations, métiers, niveaux, types d'activité, cascade des structures…)
 * comme ouverte à tout utilisateur AUTHENTIFIÉ, sans permission dédiée.
 *
 * Pourquoi : ces listes alimentent les formulaires d'autres modules (créer un membre exige
 * civilités + situations + pays + villes + formations + métiers + niveaux + cascade des
 * structures…). Les garder sous la permission `x_voir` de leur module faisait qu'un rôle
 * autorisé à « Créer un membre » ne pouvait pas le faire - les sélecteurs revenaient vides
 * (audit 2026-08-01, écarts H1/H8/H9). La permission d'un module ne doit jamais fermer
 * l'action d'un autre : la lecture de nomenclature est donc un droit de tout connecté,
 * seules les ÉCRITURES (créer/modifier/supprimer/reverser) restent sous permission.
 *
 * Effet réel : aucun - `PermissionsGuard` laisse déjà passer toute route sans
 * `@RequirePermissions` (le `JwtAuthGuard` reste, lui, obligatoire). Ce décorateur existe
 * pour que l'ouverture soit EXPLICITE : `scripts/check-route-permissions.js` refuse toute
 * route sans garde qui ne porte ni `@Public()`, ni `@ReferentialRead()`, ni une exemption
 * justifiée.
 *
 * ⚠️ Ne JAMAIS le poser sur une route qui renvoie de la donnée de membre (liste, fiche,
 * annuaire, paiements…) : ces routes-là gardent leur `@RequirePermissions` + le contrôle
 * de périmètre.
 */
export const ReferentialRead = () => SetMetadata(REFERENTIAL_READ_KEY, true);
