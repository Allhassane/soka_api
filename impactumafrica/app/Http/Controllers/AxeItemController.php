<?php

namespace App\Http\Controllers;

use App\Models\AxeItemDescription;
use App\Models\Domaine;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class AxeItemController extends Controller
{
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Contracts\View\Factory|\Illuminate\Contracts\View\View|\Illuminate\Foundation\Application|object
     */
    public function list()
    {
        $datas = AxeItemDescription::get();
        return view('backend.axe_items.list', compact('datas'));
    }

    /**
     * Show the form for creating a new resource.
     *
     * @return \Illuminate\Contracts\View\Factory|\Illuminate\Contracts\View\View|\Illuminate\Foundation\Application|object
     */
    public function create()
    {
        $axes = Domaine::get();
        return view('backend.axe_items.create', compact('axes'));

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
                'libelle'=>'required',
            ]);
        if($validator->fails())
        {
            return back()->withInput()->with('error','Sous axe obligatoire!');
        }
        else
        {

            AxeItemDescription::create(
                [
                    'domaine_id' => $request->domaine_id,
                    'libelle' => $request->libelle,
                    'description'=>$request->description,
                ]
            );
            return redirect()->route('axe_item.list')->with('success','Sous axe ajouté avec succes .');
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
     * @return \Illuminate\Contracts\View\Factory|\Illuminate\Contracts\View\View|\Illuminate\Foundation\Application|object
     */
    public function edit($id)
    {
        $axes = Domaine::get();
        $data = AxeItemDescription::findOrFail($id);
        return view('backend.axe_items.edit', compact('data', 'axes'));

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
        $data = AxeItemDescription::findOrFail($id);
        $data->domaine_id = $request->domaine_id;
        $data->libelle = $request->libelle;
        $data->description = $request->description;
        if($data->save())
        {
            return redirect()->route('axe_item.list')->with('success','Contenu sous axe modifié avec succes .');
        }
    }

    /**
     * Remove the specified resource from storage.
     *
     * @param  int  $id
     * @return \Illuminate\Http\RedirectResponse
     */
    public function destroy(AxeItemDescription $id)
    {
        $id->delete();
        return redirect()->route('axe_item.list')->with('success','Contenu sous axe supprimé avec succes');
    }
}
