<?php

namespace App\Http\Controllers;


use App\Models\Actualite;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Routing\Controller;
class ActualiteController extends Controller
{
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Contracts\Foundation\Application|\Illuminate\Contracts\View\Factory|\Illuminate\Http\Response|\Illuminate\View\View
     */


    public function __construct()
    {
        $this->middleware('auth')->except(['index','show']);
    }

    public function list()
    {
        $datas = Actualite::all();
        return view('backend.actualites.list', compact('datas'));

    }

    public function index()
    {
        $actualites = Actualite::orderBy('id', 'desc')->get();
        return view('front_end.actualite', compact('actualites'));

    }

    /**
     * Show the form for creating a new resource.
     *
     * @return \Illuminate\Contracts\View\Factory|\Illuminate\Contracts\View\View|\Illuminate\Foundation\Application|object
     */
    public function create()
    {
        return view('backend.actualites.create');
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
                'title'=>'unique:actualites'
            ]);
        if($validator->fails())
        {
            return back()->withInput()->with('error','Cette actualité existe déja!');
        }
        else
        {
            $image=$request->file('picture');
            $imageName=time().'.'. $image->extension();
            $image->move('assets/img/actualites', $imageName);

            $image2=$request->file('picture2');
            if($image2!=null)
            {
                $imageName2=random_int(1,5000).'.'. $image2->extension();
                $image2->move('assets/img/actualites', $imageName2);
            }
            if($image2==null)
            {
                $imageName2=null;
            }
                //image3
            $image3=$request->file('picture3');
            if($image3!=null)
            {
                $imageName3=random_int(1,5000).'.'. $image3->extension();
                $image3->move('assets/img/actualites', $imageName3);
            }
            if($image3==null)
            {
                $imageName3=null;
            }
            //image4
            $image4=$request->file('picture4');
            if($image4!=null)
            {
                $imageName4=random_int(1,5000).'.'. $image4->extension();
                $image4->move('assets/img/actualites', $imageName4);
            }
            if($image4==null)
            {
                $imageName4=null;
            }

            Actualite::create(
                [
                    'title' => $request->title,
                    'date_actualite' => $request->date_actualite,
                    'link' => $request->link,
                    'picture'=>$imageName,
                    'picture2'=>$imageName2,
                    'picture3'=>$imageName3,
                    'picture4'=>$imageName4,
                    'description'=>$request->description,
                ]
            );
            return redirect()->route('actualite.list')->with('success','Actualité ajoutée avec succes .');
        }

    }

    /**
     * Display the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Contracts\View\Factory|\Illuminate\Contracts\View\View|\Illuminate\Foundation\Application|object
     */
    public function show($id)
    {
        $actualites = Actualite::all();
        $data = Actualite::findOrFail($id);
        return view('front_end.detail_actualite',
            compact('data','actualites'));
    }

    /**
     * Show the form for editing the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Contracts\Foundation\Application|\Illuminate\Contracts\View\Factory|\Illuminate\Http\Response|\Illuminate\View\View
     */
    public function edit($id)
    {
        $data = Actualite::findOrFail($id);
        return view('backend.actualites.edit', compact('data'));
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
        $data = Actualite::findOrFail($id);

        $data->title = $request->title;
        $data->date_actualite = $request->date_actualite;
        $data->link = $request->link;
        $data->description = $request->description;
        if($data->save())
        {
            return redirect()->back()->with('success','Actualité modifié avec succes.');
        }
    }

    public function updatePicture(Request $request, $id)
    {
        $data = Actualite::findOrFail($id);

        $image=$request->file('picture');
        $imageName=time().'.'. $image->extension();
        $image->move('assets/img/actualites', $imageName);

        $image2=$request->file('picture2');
        if($image2!=null)
        {
            $imageName2=random_int(1,5000).'.'. $image2->extension();
            $image2->move('assets/img/actualites', $imageName2);
        }
        if($image2==null)
        {
            $imageName2=null;
        }
        
         //image3
        $image3=$request->file('picture3');
        if($image3!=null)
        {
            $imageName3=random_int(1,5000).'.'. $image3->extension();
            $image3->move('assets/img/actualites', $imageName3);
        }
        if($image3==null)
        {
            $imageName3=null;
        }
        //image4
        $image4=$request->file('picture4');
        if($image4!=null)
        {
            $imageName4=random_int(1,5000).'.'. $image4->extension();
            $image4->move('assets/img/actualites', $imageName4);
        }
        if($image4==null)
        {
            $imageName4=null;
        }
        $data->picture = $imageName;
        $data->picture2 = $imageName2;
        $data->picture3 = $imageName3;
        $data->picture4 = $imageName4;

        if($data->save())
        {
            return redirect()->back()->with('success','Photo Actualité modifié avec succes.');
        }
    }

    /**
     * Remove the specified resource from storage.
     *
     * @param  int  $id
     * @return \Illuminate\Http\RedirectResponse
     */
    public function destroy(Actualite $id)
    {
        $id->delete();
        return redirect()->back()->with('success','Actualité supprimé avec succes');

    }
}
