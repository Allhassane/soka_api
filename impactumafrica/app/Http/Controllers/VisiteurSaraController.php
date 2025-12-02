<?php

namespace App\Http\Controllers;

use App\Models\VisiteurSara2025;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use SimpleSoftwareIO\QrCode\Facades\QrCode;

class VisiteurSaraController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        $datas = VisiteurSara2025::orderByDesc('created_at')->get();
        return view('backend.inscription_sara2025.list', compact('datas'));
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        return view('front_end.sara2025.inscription');
    }

    public function afficherQrCode()
    {
        //$url = route('inscription.create'); // génère l'URL vers la page d’enregistrement
        $url = 'https://impactum.africa/login_pointage';
        return view('front_end.qrcode', [
            'qrCode' => QrCode::size(200)->generate($url),
        ]);
    }
    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validatorEmail=Validator::make($request->all(),
            [
                'email'=>'unique:visiteurs_sara2025'
            ]);
        $validatorPhone=Validator::make($request->all(),
            [
                'contact'=>'unique:visiteurs_sara2025'
            ]);
        if($validatorEmail->fails())
        {
            return back()->withInput()->with('error','Cette adresse email existe déja!');
        }
        else if ($validatorPhone->fails())
        {
            return back()->withInput()->with('error','Ce contact existe déja!');
        }
        else
        {
            VisiteurSara2025::create(
                [
                    'name' => $request->name,
                    'email'=>$request->email,
                    'contact'=>$request->contact,
                    'entreprise' => $request->entreprise,
                    'secteur_activite' => $request->secteur_activite,
                    'lieu_provenance' => $request->lieu_provenance,
                    'url_site_web' => $request->url_site_web,
                ]
            );

            return redirect()->back()->with('success','Inscription effectuée avec succès, nous vous remercions de votre visite.');

        }


    }

    /**
     * Display the specified resource.
     */
    public function show(string $id)
    {
        //
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
    public function destroy(VisiteurSara2025 $id)
    {
        $id->delete();
        return redirect()->back()->with('success','Visiteur supprimé avec succes .');
    }
}
