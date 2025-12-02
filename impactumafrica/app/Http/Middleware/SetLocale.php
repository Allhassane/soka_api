<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

class SetLocale
{
    public function handle($request, Closure $next)
    {
        \Log::info('➡ Middleware SetLocale exécuté !');
        $locale = session('locale', config('app.locale', 'fr'));
        if (! in_array($locale, ['fr','en'])) {
            $locale = config('app.locale', 'fr');
            \Log::info('Locale invalide, défini par défaut à : ' . $locale);
        }
        App::setLocale($locale);
        // Optionnel : localiser Carbon
        \Carbon\Carbon::setLocale($locale);
        \Log::info('Locale défini à : ' . $locale);
        return $next($request);
    }
}
