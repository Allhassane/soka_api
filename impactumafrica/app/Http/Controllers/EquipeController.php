<?php

namespace App\Http\Controllers;


use App\Models\Equipe;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class EquipeController extends Controller
{
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Contracts\View\Factory|\Illuminate\Contracts\View\View|\Illuminate\Foundation\Application|object
     */
    public function list()
    {
        $datas = Equipe::all();
        return view('backend.equipes.list', compact('datas'));
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
                'name'=>'unique:equipes',
            ]);
        if($validator->fails())
        {
            return back()->withInput()->with('error','Cet employé existe déja!');
        }
        else
        {
            $image=$request->file('picture');
            $imageName=time().'.'. $image->extension();
            $image->move('assets/img/personnel', $imageName);

            Equipe::create(
                [
                    'name' => $request->name,
                    'fonction' => $request->fonction,
                    'picture'=>$imageName,
                ]
            );
            return redirect()->back()->with('success','Employé ajouté avec succes.');
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
        $data = Equipe::findOrFail($id);
        $data->update($request->all());
        return redirect()->back()->with('success','Employé modifié avec succes.');

    }

    public function updatePicture(Request $request, $id)
    {
        $data = Equipe::findOrFail($id);

        $image=$request->file('picture');
        $imageName=time().'.'. $image->extension();
        $image->move('assets/img/personnel', $imageName);

        $data->picture = $imageName;
        if($data->save())
        {
            return redirect()->back()->with('success','Photo employé modifiée avec succes .');
        }

    }

    /**
     * Remove the specified resource from storage.
     *
     * @param  int  $id
     * @return \Illuminate\Http\RedirectResponse
     */
    public function destroy(Equipe $id)
    {
        $id->delete();
        return redirect()->back()->with('success','Employé supprimé avec succes .');
    }
}
