<?php

namespace App\Http\Controllers;

use App\Models\Etude;
use Illuminate\Routing\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class EtudeController extends Controller
{
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Http\Response
     */

    public function __construct()
    {
        $this->middleware('auth')->except(['index','show']);
    }

    public function index()
    {
        $etudes = Etude::orderBy('id','desc')->get();
        return view('front_end.etude', compact('etudes'));
    }

    public function list()
    {
        $datas = Etude::all();
        return view('backend.etudes.list', compact('datas'));
    }
    /**
     * Show the form for creating a new resource.
     *
     * @return \Illuminate\Contracts\Foundation\Application|\Illuminate\Contracts\View\Factory|\Illuminate\Http\Response|\Illuminate\View\View
     */
    public function create()
    {
        return view('backend.etudes.create');
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
                'title'=>'unique:etudes'
            ]);
        if($validator->fails())
        {
            return back()->withInput()->with('error','Cette étude existe déja!');
        }
        else
        {
            $image=$request->file('picture');
            $imageName=time().'.'. $image->extension();
            $image->move('assets/img/etudes', $imageName);

            $image2=$request->file('picture2');
            if($image2!=null)
            {
                $imageName2=random_int(1,9999999).'.'. $image2->extension();
                $image2->move('assets/img/etudes', $imageName2);
            }
            if($image2==null)
            {
                $imageName2=null;
            }

            Etude::create(
                [
                    'title' => $request->title,
                    'picture'=>$imageName,
                    'picture2'=>$imageName2,
                    'description'=>$request->description,
                ]
            );
            return redirect()->route('etude.list')->with('success','Etude ajoutée avec succes.');
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
        $etudes = Etude::where('id','!=',$id)->get();
        $data = Etude::findOrFail($id);
        return view('front_end.detail_etude',
            compact('data','etudes'));
    }

    /**
     * Show the form for editing the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Contracts\Foundation\Application|\Illuminate\Contracts\View\Factory|\Illuminate\Http\Response|\Illuminate\View\View
     */
    public function edit($id)
    {
        $data = Etude::findOrFail($id);
        return view('backend.etudes.edit',compact('data'));
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
        $data = Etude::findOrFail($id);
        $data->update($request->all());
        return redirect()->route('etude.list')->with('success','Etude modifiée avec succes.');
    }

    public function updatePicture(Request $request, $id)
    {
        $data = Etude::findOrFail($id);
        $image=$request->file('picture');
        $imageName=time().'.'. $image->extension();
        $image->move('assets/img/etudes', $imageName);

        $image2=$request->file('picture2');
            if($image2!=null)
            {
                $imageName2=random_int(1,9999999).'.'. $image2->extension();
                $image2->move('assets/img/etudes', $imageName2);
            }
            if($image2==null)
            {
                $imageName2=null;
            }

        $data->picture = $imageName;
        $data->picture2 = $imageName2;
        $data->save();
        return redirect()->route('etude.list')->with('success','Photo étude modifiée avec succes.');
    }

    /**
     * Remove the specified resource from storage.
     *
     * @param  int  $id
     * @return \Illuminate\Http\RedirectResponse
     */
    public function destroy(Etude $id)
    {
        $id->delete();
        return redirect()->back()->with('success','Etude supprimée avec succes.');
    }
}
