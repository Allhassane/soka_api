import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Champs modifiables d'un compte via `PUT /users/:uuid` (droit `utilisateurs_modifier`).
 *
 * ⚠️ **Liste EXPLICITE, et surtout pas `PartialType(CreateUserDto)`** - c'était le cas jusqu'au
 * 2026-08-01 et cela ouvrait un contournement complet du système de droits (audit §C2) :
 * `UserService.update()` fait un `Object.assign(user, dto)` sans filtrer ni vérifier la cible, si
 * bien que tout porteur de `utilisateurs_modifier` pouvait réécrire **trois** champs qui donnent le
 * contrôle de n'importe quel compte, **`is_admin` compris** :
 *
 * - **`password`** - haché par le hook `@BeforeUpdate` de `User`, donc immédiatement utilisable au
 *   login. Réinitialiser le mot de passe d'autrui a **déjà** sa route, correctement gardée :
 *   `PATCH /auth/reset-password/:uuid`, qui refuse en 403 toute cible autre que soi-même sauf
 *   `is_admin` (`auth.controller.ts:65-79`). C'est le seul chemin légitime.
 * - **`phone_number`** - c'est **l'identifiant de connexion** (le login se fait par téléphone), et
 *   `users.phone_number` n'a **aucun index UNIQUE** en base. Voler le numéro d'un administrateur
 *   puis passer par `POST /auth/forgot-password` (route publique) donnait le même résultat qu'un
 *   changement de mot de passe, sans jamais toucher au mot de passe. Le téléphone d'un compte suit
 *   la fiche du membre et se met à jour par `MemberAccountService.reconcileAccount()`.
 * - **`member_uuid`** - rattache le compte à un membre. Le déplacer revient à donner la session
 *   d'une personne à une autre.
 *
 * `is_active` **reste modifiable** : c'est aujourd'hui le seul moyen de désactiver un compte de
 * collaborateur (`UserService.remove()` est une suppression **physique**), et ce n'est pas un
 * vecteur de prise de contrôle - réactiver un compte ne donne ni son mot de passe ni son numéro,
 * et la demande de mot de passe part par SMS **au propriétaire du numéro**. Le sort de ce champ est
 * une décision produit ouverte (audit §M25 : « désactiver un collaborateur » n'est exigé nulle part
 * et son alias garde la **suppression physique**).
 *
 * ⚠️ Ne pas « harmoniser » ce DTO avec `CreateUserDto` : à la **création**, `password` et
 * `phone_number` sont légitimes et nécessaires (`UserService.create` distingue un mot de passe
 * fourni d'un mot de passe généré). C'est la **mise à jour** qui doit être étroite.
 *
 * Le rejet est net et non silencieux : `whitelist` + `forbidNonWhitelisted` sont posés globalement
 * (`main.ts:31-35`), donc envoyer `password` sur cette route renvoie désormais **400**.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Prénom' })
  @IsOptional()
  @IsString()
  firstname?: string;

  @ApiPropertyOptional({ description: 'Nom de famille' })
  @IsOptional()
  @IsString()
  lastname?: string;

  @ApiPropertyOptional({ description: 'Email' })
  @IsOptional()
  @IsEmail({}, { message: 'Adresse email invalide' })
  email?: string;

  @ApiPropertyOptional({ description: 'URL de la photo de profil' })
  @IsOptional()
  @IsString()
  profil_picture?: string;

  @ApiPropertyOptional({ description: 'Adresse' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description:
      'Statut actif du compte. Un compte inactif ne peut ni se connecter ni recevoir son mot de passe par SMS.',
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
