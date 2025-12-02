<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;


class AutoLogoutAfter18H
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $now = now();
        $limitAuto = now()->setTime(18, 0, 0);
        $user = Auth::user();  // déconnexion forcée

        // 2. Déconnexion automatique après 18h00 si utilisateur connecté
        if ($now->greaterThanOrEqualTo($limitAuto) && Auth::check()) {

        DB::table('log_connexions')
        ->where('user_id', $user->id)
        ->where('is_logout', false)
        ->orderBy('id', 'desc') // on prend la dernière entrée
        ->limit(1)
        ->update([
            'logout_date'     => now()->toDateString(),
            'logout_time'     => now()->toTimeString(),
            'is_logout'       => true,
            'updated_at'      => now(),
        ]);

    Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return redirect('/login_pointage')->with('info', "Vous avez été déconnecté automatiquement à 18h00.");
        }
        return $next($request);
    }
}
