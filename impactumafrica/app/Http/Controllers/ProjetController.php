<?php

namespace App\Http\Controllers;

use App\Models\Projet;
use Illuminate\Routing\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use App\Models\Actualite;

class ProjetController extends Controller
{
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Http\Response
     */

    public function __construct()
    {
        $this->middleware('auth')->except(['index','show','en_cours']);
    }

    public function index()
    {
        $projets = Projet::where('is_completed',1)->orderBy('id','DESC')->get();
        return view('front_end.projet', compact('projets'));
    }
    
    public function en_cours()
    {
        $projets_actif = Projet::where('is_completed',0)->orderBy('id','DESC')->get();
        return view('front_end.projet_encours', compact('projets_actif'));
    }

    public function list()
    {
        $datas = Projet::all();
        return view('backend.projets.list', compact('datas'));
    }


    /**
     * Show the form for creating a new resource.
     *
     * @return \Illuminate\Contracts\Foundation\Application|\Illuminate\Contracts\View\Factory|\Illuminate\Http\Response|\Illuminate\View\View
     */
    public function create()
    {
        return view('backend.projets.create');
    }

    public function create_commentaire (Request $request, $id)
    {
        $data = Projet::findOrFail($id);
        return view('backend.projets.create_commentaire', compact('id','data'));
    }

    public function store_commentaire (Request $request, $id)
    {
        $data = Projet::findOrFail($id);
        $data->commentaire = $request->commentaire;
        $data->save();
        return redirect()->route('projet.list')->with('success','Commentaire du projet ajouté/mis à jour avec succes.');
    }
    /**
     * Store a newly created resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\RedirectResponse
     */
    public function store(Request $request)
    {
        $validator=Validator::make($request->all(),
            [
                'title'=>'unique:projets'
            ]);
        if($validator->fails())
        {
            return back()->withInput()->with('error','Ce projet existe déja!');
        }
        else
        {
            $image=$request->file('picture');
            $imageName=time().'.'. $image->extension();
            $image->move('assets/img/projets', $imageName);

            $image2=$request->file('picture2');
            if($image2!=null)
            {
                $imageName2=random_int(1,9000).'.'. $image2->extension();
                $image2->move('assets/img/projets', $imageName2);
            }
            if($image2==null)
            {
                $imageName2=null;
            }
            Projet::create(
                [
                    'title' => $request->title,
                    'picture'=>$imageName,
                    'picture2'=>$imageName2,
                    'description'=>$request->description,
                    'info'=>$request->info,
                    'bailleur' => $request->bailleur,
                    'zone' => $request->zone,
                    'date_projet' => $request->date_projet,
                ]
            );
            return redirect()->route('projet.list')->with('success','Projet ajouté avec succes.');
        }
    }

    /**
     * Display the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Contracts\Foundation\Application|\Illuminate\Contracts\View\Factory|\Illuminate\Http\Response|\Illuminate\View\View
     */
  public function show($id)
    {
        $projets = Projet::all();
        $data = Projet::findOrFail($id);
        $images_projets = Actualite::where('is_projet',1)->orderBy('id','DESC')->get();
        //dd($images_projets);
        if($data->is_completed == 0)
        {
            return view('front_end.detail_projet_encour',
                compact('data','projets','images_projets'));
        }
        else
        {
            return view('front_end.detail_projet1',
                compact('data','projets'));
        }

    }


    /**
     * Show the form for editing the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Contracts\Foundation\Application|\Illuminate\Contracts\View\Factory|\Illuminate\Http\Response|\Illuminate\View\View
     */
    public function edit($id)
    {
        $data = Projet::findOrFail($id);
        return view('backend.projets.edit', compact('data'));
    }


    /**
     * Update the specified resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  int  $id
     * @return \Illuminate\Http\RedirectResponse
     */
    public function update(Request $request, $id)
    {
        $data = Projet::findOrFail($id);
        $data->title = $request->title;
        $data->description = $request->description;
        $data->bailleur = $request->bailleur;
        $data->info =$request->info;
        $data->zone = $request->zone;
        $data->date_projet = $request->date_projet;
        if($data->save())
        {
            return redirect()->route('projet.list')->with('success','Projet modifié avec succes.');
        }
    }

    public function updatePicture(Request $request, $id)
    {
        $data = Projet::findOrFail($id);
        $image=$request->file('picture');
        $imageName=time().'.'. $image->extension();
        $image->move('assets/img/projets', $imageName);

        $image2=$request->file('picture2');
        if($image2!=null)
        {
            $imageName2=random_int(1,9000).'.'. $image2->extension();
            $image2->move('assets/img/projets', $imageName2);
        }
        if($image2==null)
        {
            $imageName2=null;
        }
        $data->picture = $imageName;
        $data->picture2 = $imageName2;
        if($data->save())
        {
            return redirect()->route('projet.list')->with('success','Photos du projet modifiés avec succes .');
        }
    }

    /**
     * Remove the specified resource from storage.
     *
     * @param  int  $id
     * @return \Illuminate\Http\RedirectResponse
     */
    public function destroy(Projet $id)
    {
        $id->delete();
        return redirect()->route('projet.list')->with('error','Projet supprimé avec succes');
    }
}
