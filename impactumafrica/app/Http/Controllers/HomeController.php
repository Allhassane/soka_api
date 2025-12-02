<?php

namespace App\Http\Controllers;

use App\Models\Actualite;
use App\Models\Domaine;
use App\Models\Equipe;
use App\Models\Etude;
use App\Models\Newsletter;
use App\Models\Partenaire;
use App\Models\Projet;
use App\Models\Recrutement;
use App\Models\User;
use App\Models\Video;
use App\Models\Photo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Routing\Controller;
use App\Models\VisiteurSara2025;
use Illuminate\Support\Facades\DB;

class HomeController extends Controller
{
    /**
     * Create a new controller instance.
     *
     * @return void
     */
    public function __construct()
    {
        $this->middleware('auth')->except(['welcome','about','newsletter']);
    }

    /**
     * Show the application dashboard.
     *
     * @return \Illuminate\Contracts\Support\Renderable
     */
    public function welcome()
    {

        $projets = Projet::orderBy('id','desc')->take(4)->get();
        $partenaires = Partenaire::orderBy('id','asc')->get();
        $axes = Domaine::all();
        $actualites = Actualite::orderBy('id','desc')->take(3)->get();
        $infos = Actualite::orderBy('id','desc')->get();
        //dd($actualites);
        return view('index1', compact('projets','partenaires','actualites','axes','infos'));
    }

    public function about()
    {
        $axes = Domaine::all();
        $partenaires = Partenaire::all();
        $equipes = Equipe::get();
        //$equipes1 = Equipe::skip(5)->take(4)->get();
        //dd($equipes1);
        return view('front_end.presentation', compact('partenaires','equipes','axes'));
    }

    public function index()
    {
        $auth_user = auth()->user();
        //dd($auth_user->role);
        if($auth_user->role != 'SuperAdmin')
        {
            return redirect()->back()->with('error',"Vous n'êtes pas autorisé à accéder à cette page");
        }

        $projets =Projet::count('id');
        $users =User::count('id');
        $newsletters =Newsletter::count('id');
        $news =Actualite::count('id');
        $partenaires =Partenaire::count('id');
        $domaines =Domaine::count('id');
        $etudes =Etude::count('id');
        $recrutements =Recrutement::count('id');
        $equipes =Equipe::count('id');
        $photos = Photo::count('id');
        $videos = Video::count('id');
        $visiteurs = VisiteurSara2025::count('id');
        return view('home',compact('projets',
            'users','newsletters','equipes','visiteurs'
            ,'news','partenaires','domaines','etudes','recrutements','photos','videos'));
    }


    public function dashboard_pointage ()
    {
        $now = now();
        $limit = now()->setTime(17, 30, 0);
        $canLogout = $now->greaterThanOrEqualTo($limit);
        $today = date('Y-m-d');
        $user_online = DB::table('log_connexions')->where('is_login',1)
        //->where('is_logout',0)
        ->where('login_date',$today)->count('id');
        $employes = User::where('role','Utilisateur normal')->count('id');
        return view('pointage_dashbord',compact('employes','user_online','canLogout'));
    }


    public function newsletter(Request $request)
    {
        $validator=Validator::make($request->all(),
            [
                'email'=>'unique:newsletters'
            ]);
        if($validator->fails())
        {
            return back()->withInput()->with('error','Désolé vous etes deja abonné à notre newsletter !');
        }
        else
        {
            Newsletter::create(
                [
                    'email'=>$request->email,
                ]
            );
            return redirect()->back()->with('success','Votre abonnement a été effectué avec succes!');

        }
    }

    public function list_newsletter()
    {
        $datas = Newsletter::all();
        return view('backend.newsletter.list', compact('datas'));
    }

    public function destroy(Newsletter $id)
    {
        $id->delete();
        return redirect()->back()->with('success','Abonné supprimé de la newsletter avec succes');

    }
}
