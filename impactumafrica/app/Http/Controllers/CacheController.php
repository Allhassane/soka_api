<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

class CacheController extends Controller
{
    public function clearConfigCache()
    {
        // Exécuter la commande Artisan pour vider le cache de configuration
        Artisan::call('config:clear');

        // Retourner une réponse indiquant que l'opération a été effectuée
        return response()->json([
            'message' => 'Cache de configuration effacé avec succès !'
        ]);
    }

    public function cacheConfig()
    {
        // Exécuter la commande Artisan pour mettre en cache la configuration
        Artisan::call('config:cache');

        // Retourner une réponse indiquant que l'opération a été effectuée
        return response()->json([
            'message' => 'Configuration mise en cache avec succès !'
        ]);
    }


    public function clearRouteCache()
    {
        // Exécuter la commande Artisan pour vider le cache des routes
        Artisan::call('route:clear');

        // Retourner une réponse JSON confirmant l'exécution
        return response()->json([
            'message' => 'Cache des routes effacé avec succès !'
        ]);
    }

    public function cacheRoutes()
    {
        // Exécuter la commande Artisan pour mettre en cache les routes
        Artisan::call('route:cache');

        // Retourner une réponse JSON confirmant l'exécution
        return response()->json([
            'message' => 'Routes mises en cache avec succès !'
        ]);
    }

    public function clearViewCache()
    {
        // Exécuter la commande Artisan pour vider le cache des vues
        Artisan::call('view:clear');

        // Retourner une réponse JSON confirmant l'exécution
        return response()->json([
            'message' => 'Cache des vues effacé avec succès !'
        ]);
    }

    public function cacheViews()
    {
        // Exécuter la commande Artisan pour mettre en cache les vues compilées
        Artisan::call('view:cache');

        // Retourner une réponse JSON confirmant l'exécution
        return response()->json([
            'message' => 'Vues mises en cache avec succès !'
        ]);
    }

    public function optimizeApp()
    {
        // Exécuter la commande Artisan pour optimiser l'application
        Artisan::call('optimize');

        // Retourner une réponse JSON confirmant l'exécution
        return response()->json([
            'message' => 'Application optimisée avec succès !'
        ]);
    }


}
