<?php

namespace App\Http\Controllers;

use App\Models\LogConnexion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use Carbon\Carbon;
use DateTime;
use Jenssegers\Agent\Agent; // si tu installes le package


class LogConnexionController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function login()
    {
        return view('auth.login_pointage');

    }

    public function index()
    {
        return view('auth.login');
    }

public function index_jour()
{
    $user_id = Auth::user()->id;
    $today = date('Y-m-d');
    //dd($today);

    // Récupère toutes les connexions du jour
    $datas = LogConnexion::where('login_date', $today)
        //->where('user_id', '!=', $user_id)
        ->get();

    return view('backend.log_connexion.index', compact('datas'));
}


public function positions()
{

    $today = date('Y-m-d');

    // On récupère tous les utilisateurs connectés aujourd'hui
    $users = LogConnexion::where('login_date', $today)->get();

    $locations = $users->map(function($item) {
        return [
            'user' => $item->user->name ?? 'Inconnu',
            'login_lat' => $item->latitude,
            'login_lon' => $item->longitude,
            'logout_lat' => $item->latitude_logout,
            'logout_lon' => $item->longitude_logout,
            'heure_login' => $item->login_time,
            'heure_logout' => $item->logout_time ?? 'Toujours en ligne'
        ];
    });

    return response()->json($locations);
}


public function getConnectionsByUser()
{
    if(Auth::user()->role != 'Utilisateur normal')
    {
    $connexions = DB::table('log_connexions')
        ->join('users', 'log_connexions.user_id', '=', 'users.id')
        ->select(
            'users.id',
            'users.name as nom_utilisateur',
            'users.email as email',
            DB::raw('SUM(
                CASE
                    WHEN logout_time IS NOT NULL AND login_time IS NOT NULL
                    THEN TIME_TO_SEC(TIMEDIFF(logout_time, login_time))
                    ELSE 0
                END
            ) as total_secondes')
        )
        ->where('log_connexions.is_login', true)
        ->where('log_connexions.is_logout', true)
        ->groupBy('users.id', 'users.name')
        ->get()
        ->map(function ($item) {
            $heures = floor($item->total_secondes / 3600);
            $minutes = floor(($item->total_secondes % 3600) / 60);
            $secondes = $item->total_secondes % 60;

            $item->total_heures_travail = sprintf('%02d:%02d:%02d', $heures, $minutes, $secondes);
            unset($item->total_secondes);

            return $item;
        });

    return view('backend.log_connexion.bilan', compact('connexions'));
    }
    else
    {
        return redirect()->back();
    }
}

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $today = date('Y-m-d');

        // ✅ Validation des champs
        $request->validate([
            'email' => 'required|string|email',
            'password' => 'required|string',
        ]);

        // 🔑 Tentative de connexion
        if (!Auth::attempt($request->only('email', 'password'), $request->boolean('remember'))) {
            return back()->withErrors([
                'email' => 'Identifiants incorrects.',
            ]);
        }

        // 🔒 Régénération de session
        $request->session()->regenerate();

        // 👤 Infos utilisateur connecté
        $user = Auth::user();

        // 🌐 IP et User-Agent
        $ip = $request->ip();
        $userAgent = $request->header('User-Agent');

        // 🧭 Détection du navigateur et de l'appareil via Jenssegers\Agent
        $agent = new Agent();
        $agent->setUserAgent($userAgent);

        $browser = $agent->browser() ?: 'Inconnu';
        $platform = $agent->platform() ?: 'Inconnu';
        $deviceType = $agent->deviceType();

        switch ($deviceType) {
            case 'desktop':
                $device = 'PC (' . $platform . ')';
                break;
            case 'tablet':
                $device = 'Tablette (' . $platform . ')';
                break;
            case 'phone':
                $device = 'Mobile (' . $platform . ')';
                break;
            default:
                $device = $platform ?: 'Inconnu';
                break;
        }

        // 🏢 Adresse IP autorisée (celle du bureau)
        $allowedIps = [
            '160.120.57.205',
            '127.0.0.1',   // exemple : IP du bureau principal
            '::1',   // si tu as plusieurs adresses autorisées
        ];

        // 🚫 Vérification de l’adresse IP
        if (!in_array($ip, $allowedIps)) {
            Auth::logout();
            return back()->withInput()->withErrors([
                'email' => "Vous devez être au bureau pour vous connecter. (IP détectée : $ip)",
            ]);
        }

        // 🔍 Vérifier si l'utilisateur est déjà connecté aujourd'hui
        $existingConnexion = DB::table('log_connexions')
            ->where('user_id', $user->id)
            ->where('is_login', true)
            ->where('login_date', $today)
            ->first();

        if ($existingConnexion) {
            // ✅ Mettre à jour l'enregistrement existant
            DB::table('log_connexions')
                ->where('id', $existingConnexion->id)
                ->update([
                    'ip_address' => $ip,
                    'device'     => $device,
                    'browser'    => $browser,
                    'updated_at' => now(),
                ]);
        } else {
            // 🗄 Créer un nouvel enregistrement
            DB::table('log_connexions')->insert([
                'user_id'     => $user->id,
                'login_date'  => now()->toDateString(),
                'login_time'  => now()->toTimeString(),
                'is_login'    => true,
                'is_logout'   => false,
                'logout_date' => null,
                'logout_time' => null,
                'ip_address'  => $ip,
                'device'      => $device,
                'browser'     => $browser,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
        }

        // ➡️ Redirection vers le tableau de bord
        return redirect()->intended(route('pointage.dashboard'));
    }

    public function demande_motif(Request $request)
{
    $today = date('Y-m-d');
    $user = Auth::user();

    // Vérifier si l'utilisateur est déjà connecté aujourd'hui
    $existingConnexion = DB::table('log_connexions')
        ->where('user_id', $user->id)
        ->where('login_date', $today)
        ->first();

    if ($existingConnexion) {
        DB::table('log_connexions')
            ->where('id', $existingConnexion->id)
            ->update([
                'motif_deconnexion' => $request->motif_deconnexion,
                'logout_time' => now()->format('H:i:s'),
                'updated_at' => now(),
            ]);

        // On envoie un flag à la vue pour déclencher la déconnexion
        return back()->with('success', 'Motif de départ enregistré avec succès')->with('logout', true);
    }

    return back()->withErrors(['error' => 'Aucune connexion trouvée pour aujourd\'hui.']);
}


    /**
     * Display the specified resource.
     */
    public function list_employe_show(string $id)
    {
        if(Auth::user()->role != 'Utilisateur normal')
        {
            $user = LogConnexion::where('user_id',$id)->first();
        $datas = LogConnexion::where('user_id',$id)->orderBy('id','DESC')->get();
        return view('backend.log_connexion.detail', compact('datas','user'));
        }
        else
        {
        return redirect()->back();
        }
    }

    public function list_employe_show_periode(string $id, $debut, $fin)
    {
        if(Auth::user()->role != 'Utilisateur normal')
        {
            $date_debut = \Carbon\Carbon::parse($debut)->format('d-m-Y');
            $date_fin   = \Carbon\Carbon::parse($fin)->format('d-m-Y');
            $user = LogConnexion::where('user_id',$id)->first();
            $datas = LogConnexion::where('user_id',$id)->whereBetween('login_date', [$debut, $fin])->get();
        return view('backend.log_connexion.detail_periode', compact('datas','user','date_debut','date_fin'));
        }
        else
        {
        return redirect()->back();
        }
    }

    public function search_page()
    {
        if(Auth::user()->role != 'Utilisateur normal')
        {
        return view('backend.log_connexion.search');
        }
        else
        {
        return redirect()->back();
        }
    }

public function get_search_page(Request $request)
{
    if(Auth::user()->role != 'Utilisateur normal')
    {
        // Validation des dates
        $validator = Validator::make($request->all(), [
            'date_debut' => 'required|date',
            'date_fin' => 'required|date|after_or_equal:date_debut',
        ], [
            'date_debut.required' => 'La date de début est obligatoire.',
            'date_debut.date' => 'La date de début doit être une date valide.',
            'date_fin.required' => 'La date de fin est obligatoire.',
            'date_fin.date' => 'La date de fin doit être une date valide.',
            'date_fin.after_or_equal' => 'La date de fin doit être supérieure ou égale à la date de début.'
        ]);

        if ($validator->fails()) {
            return redirect()->back()
                ->withErrors($validator)
                ->withInput()
                ->with('error', 'Veuillez vérifier les dates saisies.');
        }

        $date_debut = $request->date_debut;
        $date_fin = $request->date_fin;

        $connexions = DB::table('log_connexions')
            ->join('users', 'log_connexions.user_id', '=', 'users.id')
            ->select(
                'users.id',
                'users.name as nom_utilisateur',
                'users.email as email',
                DB::raw('SUM(
                    CASE
                        WHEN logout_time IS NOT NULL AND login_time IS NOT NULL
                        THEN TIME_TO_SEC(TIMEDIFF(logout_time, login_time))
                        ELSE 0
                    END
                ) as total_secondes')
            )
            ->where('log_connexions.is_login', true)
            ->where('log_connexions.is_logout', true)
            ->whereBetween('log_connexions.login_date', [$date_debut, $date_fin])
            ->groupBy('users.id', 'users.name', 'users.email')
            ->get()
            ->map(function ($item) {
                $heures = floor($item->total_secondes / 3600);
                $minutes = floor(($item->total_secondes % 3600) / 60);
                $secondes = $item->total_secondes % 60;

                $item->total_heures_travail = sprintf('%02d:%02d:%02d', $heures, $minutes, $secondes);
                unset($item->total_secondes);

                return $item;
            });

        return view('backend.log_connexion.search', compact('connexions', 'date_debut', 'date_fin'));
    }
    else
    {
        return redirect()->back();
    }
}

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(string $id)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id)
    {
        //
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id)
    {
        //
    }
}
