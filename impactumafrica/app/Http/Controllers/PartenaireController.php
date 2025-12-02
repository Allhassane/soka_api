<?php

namespace App\Http\Controllers;


use App\Models\Partenaire;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class PartenaireController extends Controller
{
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Contracts\Foundation\Application|\Illuminate\Contracts\View\Factory|\Illuminate\Http\Response|\Illuminate\View\View
     */
    public function index()
    {
        $datas = Partenaire::get();
        return view('backend.partenaires.list', compact('datas'));
    }

    /**
     * Show the form for creating a new resource.
     *
     * @return \Illuminate\Http\Response
     */
    public function create()
    {
        //
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
                'title'=>'unique:partenaires'
            ]);
        if($validator->fails())
        {
            return back()->withInput()->with('error','Ce partenaire existe déja!');
        }
        else
        {
            $image=$request->file('picture');
            $imageName=time().'.'. $image->extension();
            $image->move('assets/img/partenaires', $imageName);

            Partenaire::create(
                [
                    'title' => $request->title,
                    'picture'=>$imageName,
                ]
            );
            return redirect()->back()->with('success','Partenaire ajouté avec succes.');
        }
    }
    /**
     * Display the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */
    public function show($id)
    {
        //
    }

    /**
     * Show the form for editing the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */
    public function edit($id)
    {
        //
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
        $data = Partenaire::findOrFail($id);

        $image=$request->file('picture');
        $imageName=time().'.'. $image->extension();
        $image->move('assets/img/partenaires', $imageName);

        $data->title = $request->title;
        $data->picture = $imageName;
        if($data->save())
        {
            return redirect()->back()->with('success','Partenaire modifié avec succes .');
        }
    }

    /**
     * Remove the specified resource from storage.
     *
     * @param  int  $id
     * @return \Illuminate\Http\RedirectResponse
     */
    public function destroy(Partenaire $id)
    {
        $id->delete();
        return redirect()->back()->with('success','Partenaire supprimé avec succes');
    }
}
