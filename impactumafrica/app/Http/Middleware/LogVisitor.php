<?php

namespace App\Http\Middleware;

use App\Models\Visit;
use Carbon\Carbon;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class LogVisitor
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next)
    {
        \Log::info('➡ Middleware LogVisitor exécuté !');
        $ip = $request->ip();
        $userAgent = $request->userAgent(); // navigateur/appareil
        $visitorId = md5($ip . $userAgent); 

        $now = Carbon::now();

        \Log::info('IP visitée : ' . $request->ip());
        Visit::updateOrCreate(
          //  ['ip_address' => $ip],
            //    ['last_activity' => $now]
            ['visitor_id' => $visitorId],
    [
        'ip_address' => $ip,
        'user_agent' => $userAgent,
        'last_activity' => now(),
    ]
        );
        
        

        // Supprimer les IP inactives depuis plus de 5 minutes
        $expirationTime = $now->copy()->subMinutes(5);
        Visit::where('last_activity', '<', $expirationTime)->delete();
        \Log::info('Middleware visiteur actif exécuté pour IP : ' . $request->ip());

        return $next($request);
    }

}
