<?php

namespace App\Providers;

use App\Models\Actualite;
use App\Models\Visit;
use App\Models\Recrutement;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\View;
use Carbon\Carbon;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Schema::defaultStringLength(191);
        //pour les actualite
        View::composer('*', function ($view) {
            $view->with('nombreActualites', Actualite::count());
        });
        //pour les recrutements
        View::composer('*', function ($view) {
            $view->with('nombreRecrutements', Recrutement::where('is_expired',0)->count());
        });
        //pour les visiteurs en ligne
        //View::composer('*', function ($view) {
           // $nombreVisiteursActifs = Visit::count();
           // $view->with('nombreVisiteursActifs', Visit::count());
       // });
        //\Log::info('Nombre visiteurs actifs : ' . $nombreVisiteursActifs);

        // Visiteurs : total et par jour
        View::composer('*', function ($view) {
        $nombreVisiteursTotal = Visit::count();
        $nombreVisiteursAujourdHui = Visit::whereDate('created_at', Carbon::today())->count();

        $view->with([
            'nombreVisiteursActifs' => $nombreVisiteursTotal,
            'nombreVisiteursAujourdHui' => $nombreVisiteursAujourdHui,
        ]);

        View::composer('*', function ($view) {
        $now = now();
        $limit = now()->setTime(17, 30, 0);
        $canLogout = $now->greaterThanOrEqualTo($limit);

        $view->with('canLogout', $canLogout);

        if ($this->app->bound('router')) {
        $router = $this->app['router'];
        // pousse le middleware à la fin du groupe 'web'
        $router->pushMiddlewareToGroup('web', \App\Http\Middleware\AutoLogoutAfter18H::class);
        }
        });
        });

    }
}
