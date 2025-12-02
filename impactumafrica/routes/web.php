<?php

use App\Http\Controllers\BasicArtisanCommandeController;
use App\Http\Controllers\CacheController;
use App\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Auth;
use App\Http\Controllers\HomeController;
use App\Http\Controllers\SitemapController;
use App\Http\Controllers\DomaineController;
use App\Http\Controllers\AxeItemController;
use App\Http\Controllers\ActualiteController;
use App\Http\Controllers\RecrutementController;
use App\Http\Controllers\ProjetController;
use App\Http\Controllers\EtudeController;
use App\Http\Controllers\EquipeController;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\PartenaireController;
use App\Http\Controllers\ContactController;
use App\Http\Controllers\MediathequeController;
use App\Http\Controllers\VisiteurSaraController;
use App\Http\Middleware\SetLocale;
use App\Http\Middleware\LogVisitor;
use Spatie\Honeypot\ProtectAgainstSpam;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use App\Http\Controllers\ChatbotController;
use App\Http\Controllers\LogConnexionController;
use App\Models\LogConnexion;

/*
|----------------------------------------------------------------------
| Web Routes
|----------------------------------------------------------------------
| Here is where you can register web routes for your application.
| These routes are loaded by the RouteServiceProvider within a group which
| contains the "web" middleware group. Now create something great!
|
*/




Route::middleware([LogVisitor::class, SetLocale::class])->group(function () {

    // 🔄 Changement de langue
    Route::get('/lang/{locale}', function (string $locale) {
        abort_unless(in_array($locale, ['fr','en']), 400);
        session(['locale' => $locale]);
        app()->setLocale($locale);
        return back();
    })->name('lang.switch');

    // Accueil
    Route::get('/', [HomeController::class, 'welcome'])->name('index');

    // A propos
    Route::prefix('a-propos')->group(function () {
        Route::get('/', [HomeController::class, 'about'])->name('about.index');
    });

    // Axes stratégiques
    Route::prefix('axes-strategiques')->group(function () {
        Route::get('/', [DomaineController::class, 'index'])->name('domaine.index');
        Route::get('/{id}/detail', [DomaineController::class, 'show'])->name('domaine.show');
    });


    // Actualités
    Route::prefix('actualite')->group(function () {
        Route::get('/', [ActualiteController::class, 'index'])->name('actualite.index');
        Route::get('/{id}/detail', [ActualiteController::class, 'show'])->name('actualite.show');
    });

    // Recrutement
    Route::prefix('recrutement')->group(function () {
        Route::get('/', [RecrutementController::class, 'index'])->name('recrutement.index');
        Route::get('/{id}/detail', [RecrutementController::class, 'show'])->name('recrutement.show');
    });

    // Projets
    Route::prefix('projet')->group(function () {
        Route::get('/', [ProjetController::class, 'index'])->name('projet.index');
        Route::get('/en_cours', [ProjetController::class, 'en_cours'])->name('projet.en_cours');
        Route::get('/{id}/detail', [ProjetController::class, 'show'])->name('projet.show');
        Route::get('/{id}/create', [ProjetController::class, 'create_commentaire'])->name('projet.create_commentaire');
        Route::post('/{id}/create', [ProjetController::class, 'store_commentaire'])->name('projet.store_commentaire');
    });

    // Etudes
    Route::prefix('etude')->group(function () {
        Route::get('/', [EtudeController::class, 'index'])->name('etude.index');
        Route::get('/{id}/detail', [EtudeController::class, 'show'])->name('etude.show');
    });
    // Contact
    Route::prefix('contact')->group(function () {
        Route::get('/', [ContactController::class, 'contact'])->name('contact.index');
        Route::post('/', [ContactController::class, 'storeContact'])->name('contact.store')->middleware(['throttle:3,1', ProtectAgainstSpam::class]); // 3 requêtes par minute par IP;
    });

    // Galerie
    Route::prefix('galerie-image')->group(function () {
        Route::get('/', [MediathequeController::class, 'indexPhoto'])->name('galerie.index');
    });

    // Vidéos
    Route::prefix('video')->group(function () {
        Route::get('/', [MediathequeController::class, 'indexVideo'])->name('video.index');
    });


});


//les routes du backend à exclure du middleware SetLocale
    Route::post('/chatbot', [ChatbotController::class, 'ask'])->name('chatbot.ask');

    // Axes stratégiques
    Route::prefix('axes-strategiques')->group(function () {
        Route::get('/list', [DomaineController::class, 'list'])->name('domaine.list');
        Route::get('/create', [DomaineController::class, 'create'])->name('domaine.create');
        Route::post('/create', [DomaineController::class, 'store'])->name('domaine.store');
        Route::get('/{id}/edit', [DomaineController::class, 'edit'])->name('domaine.edit');
        Route::get('/{id}/editPicture', [DomaineController::class, 'editPicture'])->name('domaine.editPicture');
        Route::post('/{id}/update', [DomaineController::class, 'update'])->name('domaine.update');
        Route::post('/{id}/updatePicture', [DomaineController::class, 'updatePicture'])->name('domaine.updatePicture');
        Route::get('/{id}/delete', [DomaineController::class, 'destroy'])->name('domaine.delete');
    });

    // Sous-axes stratégiques
    Route::prefix('sous_axes-strategiques')->group(function () {
        Route::get('/list', [AxeItemController::class, 'list'])->name('axe_item.list');
        Route::get('/create', [AxeItemController::class, 'create'])->name('axe_item.create');
        Route::post('/create', [AxeItemController::class, 'store'])->name('axe_item.store');
        Route::get('/{id}/edit', [AxeItemController::class, 'edit'])->name('axe_item.edit');
        Route::post('/{id}/update', [AxeItemController::class, 'update'])->name('axe_item.update');
        Route::get('/{id}/delete', [AxeItemController::class, 'destroy'])->name('axe_item.delete');
    });

    // Actualités
    Route::prefix('actualite')->group(function () {
        Route::get('/list', [ActualiteController::class, 'list'])->name('actualite.list');
        Route::get('/create', [ActualiteController::class, 'create'])->name('actualite.create');
        Route::post('/create', [ActualiteController::class, 'store'])->name('actualite.store');
        Route::get('/{id}/edit', [ActualiteController::class, 'edit'])->name('actualite.edit');
        Route::post('/{id}/update', [ActualiteController::class, 'update'])->name('actualite.update');
        Route::post('/{id}/updatePicture', [ActualiteController::class, 'updatePicture'])->name('actualite.updatePicture');
        Route::get('/{id}/delete', [ActualiteController::class, 'destroy'])->name('actualite.delete');
    });

    // Recrutement
    Route::prefix('recrutement')->group(function () {
        Route::get('/list', [RecrutementController::class, 'list'])->name('recrutement.list');
        Route::get('/create', [RecrutementController::class, 'create'])->name('recrutement.create');
        Route::post('/create', [RecrutementController::class, 'store'])->name('recrutement.store');
        Route::get('/{id}/edit', [RecrutementController::class, 'edit'])->name('recrutement.edit');
        Route::post('/{id}/update', [RecrutementController::class, 'update'])->name('recrutement.update');
        Route::get('/{id}/delete', [RecrutementController::class, 'destroy'])->name('recrutement.delete');
    });

    // Projets
    Route::prefix('projet')->group(function () {
        Route::get('/list', [ProjetController::class, 'list'])->name('projet.list');
        Route::get('/create', [ProjetController::class, 'create'])->name('projet.create');
        Route::post('/create', [ProjetController::class, 'store'])->name('projet.store');
        Route::get('/{id}/edit', [ProjetController::class, 'edit'])->name('projet.edit');
        Route::post('/{id}/update', [ProjetController::class, 'update'])->name('projet.update');
        Route::post('/{id}/updatePicture', [ProjetController::class, 'updatePicture'])->name('projet.updatePicture');
        Route::get('/{id}/delete', [ProjetController::class, 'destroy'])->name('projet.delete');
        Route::get('/{id}/create', [ProjetController::class, 'create_commentaire'])->name('projet.create_commentaire');
        Route::post('/{id}/create', [ProjetController::class, 'store_commentaire'])->name('projet.store_commentaire');
    });

    // Etudes
    Route::prefix('etude')->group(function () {
        Route::get('/list', [EtudeController::class, 'list'])->name('etude.list');
        Route::get('/create', [EtudeController::class, 'create'])->name('etude.create');
        Route::post('/create', [EtudeController::class, 'store'])->name('etude.store');
        Route::get('/{id}/edit', [EtudeController::class, 'edit'])->name('etude.edit');
        Route::post('/{id}/update', [EtudeController::class, 'update'])->name('etude.update');
        Route::post('/{id}/updatePicture', [EtudeController::class, 'updatePicture'])->name('etude.updatePicture');
        Route::get('/{id}/delete', [EtudeController::class, 'destroy'])->name('etude.delete');
    });

    // Équipe
    Route::prefix('equipe')->group(function () {
        Route::get('/list', [EquipeController::class, 'list'])->name('equipe.list');
        Route::post('/create', [EquipeController::class, 'store'])->name('equipe.store');
        Route::post('/{id}/update', [EquipeController::class, 'update'])->name('equipe.update');
        Route::post('/{id}/updatePicture', [EquipeController::class, 'updatePicture'])->name('equipe.updatePicture');
        Route::get('/{id}/delete', [EquipeController::class, 'destroy'])->name('equipe.delete');
    });

    // Partenaires
    Route::prefix('partenaire')->group(function () {
        Route::get('/list', [PartenaireController::class, 'index'])->name('partenaire.list');
        Route::post('/create', [PartenaireController::class, 'store'])->name('partenaire.store');
        Route::post('/{id}/edit', [PartenaireController::class, 'update'])->name('partenaire.update');
        Route::get('/{id}/delete', [PartenaireController::class, 'destroy'])->name('partenaire.delete');
    });

    // Contact
    Route::prefix('contact')->group(function () {
        Route::get('/list', [ContactController::class, 'listContact'])->name('contact.list');
        Route::get('/not-read', [ContactController::class, 'listContactNotRead'])->name('contact.list_not_read');
        Route::get('/{id}/delete', [ContactController::class, 'destroyContact'])->name('contact.delete');
    });

    // Galerie
    Route::prefix('galerie-image')->group(function () {
        Route::get('/list', [MediathequeController::class, 'listPhoto'])->name('galerie.list');
        Route::post('/create', [MediathequeController::class, 'storePhoto'])->name('galerie.store');
        Route::post('/{id}/update', [MediathequeController::class, 'updatePhoto'])->name('galerie.update');
        Route::post('/{id}/updatePicture', [MediathequeController::class, 'updatePicturePhoto'])->name('galerie.updatePicture');
        Route::get('/{id}/delete', [MediathequeController::class, 'destroyPhoto'])->name('galerie.delete');
    });

    // Vidéos
    Route::prefix('video')->group(function () {
        Route::get('/list', [MediathequeController::class, 'listVideo'])->name('video.list');
        Route::post('/create', [MediathequeController::class, 'storeVideo'])->name('video.store');
        Route::post('/{id}/update', [MediathequeController::class, 'updateVideo'])->name('video.update');
        Route::get('/{id}/delete', [MediathequeController::class, 'destroyVideo'])->name('video.delete');
    });

    // Newsletter
    Route::get('/sitemap', [SitemapController::class, 'generateSitemap']);
    Route::get('/newsletter', [HomeController::class, 'list_newsletter'])->name('newsletter.list');
    Route::post('/newsletter', [HomeController::class, 'newsletter'])->name('newsletter');
    Route::get('/{id}/newsletter/delete', [HomeController::class, 'destroy'])->name('newsletter.delete');

    // Utilisateurs
Route::prefix('user')->group(function () {
        Route::get('/list', [AdminController::class, 'listUser'])->name('user.list');
        Route::post('/create', [AdminController::class, 'storeUser'])->name('user.store');
        Route::post('/{id}/edit', [AdminController::class, 'updateUser'])->name('user.update');
        Route::get('/{id}/delete', [AdminController::class, 'destroyUser'])->name('user.delete');
    });

Route::middleware('auth')->group(function () {
    Route::get('/dashboard',[HomeController::class, 'index'])->name('dashboard');
    Route::get('/tableau_de_bord',[HomeController::class, 'dashboard_pointage'])->name('pointage.dashboard');
    Route::post('/demande_motif',[LogConnexionController::class, 'demande_motif'])->name('pointage.get_permission');
});


Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

//gestion des pointages
Route::prefix('login_pointage')->group(function () {
    Route::get('/', [LogConnexionController::class, 'login'])->name('pointage.auth');
    Route::post('/', [LogConnexionController::class, 'store'])->name('pointage.store');

});

Route::prefix('pointage')->group(function () {
    Route::get('/', [LogConnexionController::class, 'index_jour'])->name('pointage.index');
    Route::get('/list', [LogConnexionController::class, 'list'])->name('pointage.list');
    Route::get('/employe', [LogConnexionController::class, 'getConnectionsByUser'])->name('pointage.list_employe');
    Route::get('/employe/{id}', [LogConnexionController::class, 'list_employe_show'])->name('pointage.show');
    Route::get('/employe/{id}/{debut}/{fin}', [LogConnexionController::class, 'list_employe_show_periode'])->name('pointage.show_periode');
    Route::get('/search_page', [LogConnexionController::class, 'search_page'])->name('pointage.search');
    Route::post('/search_page', [LogConnexionController::class, 'get_search_page'])->name('pointage.get_search');
});

// web.php
Route::get('/api/positions', [LogConnexionController::class, 'positions'])->name('api.positions');


require __DIR__.'/auth.php';
