<?php

namespace App\Http\Controllers;

use App\Domaine;
use App\Etude;
use App\Projet;
use Illuminate\Http\Request;
use Spatie\Sitemap\Sitemap;
use Spatie\Sitemap\Tags\Url;

class SitemapController extends Controller
{

public function generateSitemap()
{
    $sitemap = Sitemap::create();

    $sitemap->add(Url::create('/')->setPriority(1.0))
            ->add(Url::create('/about')->setPriority(0.8))
            ->add(Url::create('/contact')->setPriority(0.8));

    // Ajoutez d'autres URL dynamiquement, par exemple depuis la base de données
    $domaines = Domaine::all(); // Assurez-vous d'importer votre modèle
    $etudes = Etude::all();
    $projets = Projet::all();// Assurez-vous d'

    foreach ($domaines as $domaine) {
        $sitemap->add(Url::create("/axes-strategiques")->setLastModificationDate($domaine->updated_at));
    }

    foreach ($etudes as $etude) {
        $sitemap->add(Url::create("/etude")->setLastModificationDate($etude->updated_at));
    }

    foreach ($projets as $projet) {
        $sitemap->add(Url::create("/projet")->setLastModificationDate($projet->updated_at));
    }

    $sitemap->writeToFile(public_path('sitemap.xml'));
}
}
