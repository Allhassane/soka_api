# API SOKA

API SOKA est une interface backend développée avec **NestJS**, destinée à la gestion de **SOKA** sur le territoire national.


Le projet est actuellement en phase de mise en place. La documentation détaillée et les spécifications métier seront ajoutées au fil de l’évolution.

---

## ⚙️ Démarrage du projet

### 1. Cloner le projet

```bash
git clone <url-du-repo>
cd soka-api
```

### 2. Installer les dépendances

Il faut privilégier yarn à npm pour une meilleure compatibilité des packages

```bash
yarn install
```

### 3. Configurer l’environnement

Créer un fichier `.env` à la racine du projet en vous basant sur `.env.example`. Exemple :

```env
APP_PORT=3000
APP_HOST=localhost
APP_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USER=root
DB_PASSWORD=
DB_NAME=soka_app

JWT_SECRET=changeme
JWT_EXPIRES_IN=3600
```

---

## 🧱 Structure de module obligatoire

> Chaque fonctionnalité (ex: `users`, `auth`) **doit avoir sa propre structure de module** comme suit :

```bash
src/
└── module-name/
    ├── module-name.module.ts      # obligatoire
    ├── module-name.controller.ts  # obligatoire
    ├── module-name.service.ts     # obligatoire
    ├── dto/                       # obligatoire
    ├── entities/                  # obligatoire
    └── interfaces/                # obligatoire
```

Cela garantit la **clarté**, la **maintenabilité** et la **modularité** du projet, surtout en travail d’équipe.

---

## 🧩 Standardisation des retours API

Tous les retours d'API passent par un **intercepteur global** (`ResponseInterceptor`) qui applique un format unique pour tous les endpoints :

### ✅ Réponse en cas de succès :

```json
{
  "success": true,
  "message": "Niveau créée avec succès",
  "data": {
    "id": 1,
    "name": "District",
    "slug": "district",
    "type": "mixte"
  }
}
```

### ❌ Réponse en cas d’erreur :

```json
{
  "success": false,
  "message": "Validation failed",
  "data": null,
  "errors": [
    "name should not be empty",
    "type must be one of the following values: public, private"
  ]
}
```

---

### 🎯 Personnalisation des messages

Utilisez le décorateur `@SuccessMessage()` pour définir un message personnalisé sur vos routes :

```ts
@Post()
@HttpCode(201)
@SuccessMessage('Niveau créée avec succès')
create(@Body() dto: CreateLevelDto) {
  return this.levvelService.create(dto);
}
```

Cela permet à l’intercepteur de récupérer dynamiquement le message à afficher dans la réponse.

---

## 🗄️ Base de données

Le projet utilise **TypeORM** avec une base de données **PostgreSQL**.

Les entités sont déclarées dans chaque module dans le dossier `entities/` et sont automatiquement chargées par TypeORM grâce à l’option `autoLoadEntities`.

---

### Documentation Swagger

L'API DESPES utilise Swagger pour documenter toutes les routes disponibles.

Dès que tu lances le projet, tu peux accéder à l'interface Swagger à l'adresse suivante :

http://localhost:3000/api/docs

Exemple d'annotations Swagger :

Dans un contrôleur :

```ts
@ApiTags('Test')
@ApiResponse({ status: 200, description: 'Retour réussi' })
@ApiResponse({ status: 400, description: 'Erreur de validation' })
```

Dans un DTO :
```ts
@ApiProperty({ example: 'Nom du niveau', description: 'Le nom complet' })
name: string;
```

Tous les endpoints doivent être documentés avec @ApiTags, @ApiResponse et les DTOs annotés avec @ApiProperty.

---

## 🚧 À venir

- Authentification JWT
- Sécurisation des endpoints
- Système de rôles (admin, responsable d’établissement, etc.)
- Génération de rapports PDF / Excel
