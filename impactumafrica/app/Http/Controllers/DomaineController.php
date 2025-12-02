<?php

namespace App\Http\Controllers;


use App\Models\AxeItemDescription;
use App\Models\Domaine;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use Illuminate\Routing\Controller;

class DomaineController extends Controller
{
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Http\Response
     */

    public function __construct()
    {
        $this->middleware('auth')->except(['index','show','sous_axe']);
    }

    public function index()
    {
        $domaines = Domaine::with('sousaxes')->orderBy('id')->get();
        //dd($domaines);
        return view('front_end.domaine', compact('domaines'));
    }

    public function list()
    {
        $datas = Domaine::get();
        return view('backend.domaines.list', compact('datas'));
    }

    /**
     * Show the form for creating a new resource.
     *
     * @return \Illuminate\Contracts\Foundation\Application|\Illuminate\Contracts\View\Factory|\Illuminate\Http\Response|\Illuminate\View\View
     */
    public function create()
    {
        return view('backend.domaines.create');
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
                'title'=>'unique:domaines'
            ]);
        if($validator->fails())
        {
            return back()->withInput()->with('error','Ce domaine d\'activité existe déja!');
        }
        else
        {
            $image=$request->file('picture');
            $imageName=time().'.'. $image->extension();
            $image->move('assets/img/domaines', $imageName);

            $image2=$request->file('picture2');
            if($image2!=null)
            {
                $imageName2=random_int(2,999999).'.'. $image2->extension();
                $image2->move('assets/img/domaines', $imageName2);
            }
            if($image2==null)
            {
                $imageName2=null;
            }

            Domaine::create(
                [
                    'title' => $request->title,
                    'picture'=>$imageName,
                    'picture2'=>$imageName2,
                    'description'=>$request->description,
                ]
            );
            return redirect()->route('domaine.list')->with('success','Domaine d\'activité ajouté avec succes .');
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
        $sous_axe = AxeItemDescription::where('id',$id)->first();

        $data = Domaine::findOrFail($id);
        $detail = Domaine::where('id',$id)->get();

        return view('front_end.detail_domaine', compact('sous_axe','detail','data'));
    }

    public function sous_axe($id){

        $data = Domaine::findOrFail($id);
        $sous_axe = AxeItemDescription::where('domaine_id',$id)->get();

        return view('front_end.sous_axe_domaine', compact('sous_axe','data'));
    }

    /**
     * Show the form for editing the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Contracts\View\Factory|\Illuminate\Contracts\View\View|\Illuminate\Foundation\Application|object
     */
    public function edit($id)
    {
        $data = Domaine::findOrFail($id);
        return view('backend.domaines.edit', compact('data'));
    }

    public function editPicture($id)
    {
        $data = Domaine::findOrFail($id);
        return view('backend.domaines.edit-picture', compact('data'));
    }

    /**
     * Update the specified resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */
    public function update(Request $request, $id)
    {
        $data = Domaine::findOrFail($id);
        $data->title = $request->title;
        $data->description = $request->description;
        if($data->save())
        {
            return redirect()->route('domaine.list')->with('success','Domaine d\'activité modifié avec succes .');
        }
    }

    public function updatePicture(Request $request, $id)
    {
        $data = Domaine::findOrFail($id);

        $image=$request->file('picture');
        $imageName=time().'.'. $image->extension();
        $image->move('assets/img/domaines', $imageName);

        $image2=$request->file('picture2');
        if($image2!=null)
        {
            $imageName2=random_int(500,959900).'.'. $image2->extension();
            $image2->move('assets/img/domaines', $imageName2);
        }
        if($image2==null)
        {
            $imageName2=null;
        }

        $image3=$request->file('picture3');
        if($image3!=null)
        {
            $imageName3=rand(1,3000).'.'. $image3->extension();
            $image3->move('assets/img/domaines', $imageName3);
        }
        if($image3==null)
        {
            $imageName3=null;
        }

        $data->picture = $imageName;
        $data->picture2 = $imageName2;
        $data->picture3 = $imageName3;
        if($data->save())
        {
            return redirect()->route('domaine.list')->with('success','Photo du domaine modifié avec succes.');
        }
    }


    /**
     * Remove the specified resource from storage.
     *
     * @param  int  $id
     * @return \Illuminate\Http\RedirectResponse
     */
    public function destroy(Domaine $id)
    {
        $id->delete();
        return redirect()->route('domaine.list')->with('success','Domaine d\'activité supprimé avec succes');
    }

}
