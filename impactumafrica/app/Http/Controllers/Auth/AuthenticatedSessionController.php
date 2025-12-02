<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;
use Illuminate\Support\Facades\DB;

class AuthenticatedSessionController extends Controller
{
    /**
     * Display the login view.
     */
    public function create(): View
    {
        return view('auth.login');
    }

    /**
     * Handle an incoming authentication request.
     */
    public function store(LoginRequest $request): RedirectResponse
    {
        $request->authenticate();

        $request->session()->regenerate();

        return redirect()->intended(route('dashboard', absolute: false));
    }

    /**
     * Destroy an authenticated session.
     */
    public function destroy(Request $request): RedirectResponse
    {
        $user = Auth::user();

    $latitude_logout = $request->input('latitude_logout');
    $longitude_logout = $request->input('longitude_logout');

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
            'latitude_logout' => $latitude_logout,
            'longitude_logout'=> $longitude_logout,
        ]);

    Auth::guard('web')->logout();
    $request->session()->invalidate();
    $request->session()->regenerateToken();

    return redirect('/login_pointage');
    }
}
