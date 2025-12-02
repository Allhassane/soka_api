<?php

namespace App\Http\Controllers;

use App\Models\Etude;
use App\Models\Recrutement;
use Illuminate\Routing\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class RecrutementController extends Controller
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

    public function list()
    {
        $datas = Recrutement::all();
        return view('backend.recrutements.list', compact('datas'));

    }

    public function index()
    {
        $recrutements = Recrutement::where('is_expired',0)->orderBy('id', 'desc')->get();
        return view('front_end.recrutement', compact('recrutements'));
    }

    /**
     * Show the form for creating a new resource.
     *
     * @return \Illuminate\Contracts\Foundation\Application|\Illuminate\Contracts\View\Factory|\Illuminate\Http\Response|\Illuminate\View\View
     */
    public function create()
    {
        return view('backend.recrutements.create');
    }

    /**
     * Store a newly created resource in storage.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\RedirectResponse
     */
    public function store(Request $request)
    {
            $document=$request->file('document');
      $documentName=time().'.'. $document->extension();
      $document->move('assets/docs', $documentName);
            Recrutement::create(
                [
                    'title' => $request->title,
                    'document' => $documentName,
                    'date_expiration' => $request->date_expiration,
                    'link' => $request->link,
                    'description'=>$request->description,
                ]
            );
            return redirect()->route('recrutement.list')->with('success','Offre ajoutée avec succes .');

    }

    /**
     * Display the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Contracts\View\Factory|\Illuminate\Contracts\View\View|\Illuminate\Foundation\Application|object
     */
    public function show($id)
    {
        $data = Recrutement::find($id);
        return view('front_end.detail_recrutement', compact('data'));
    }

    /**
     * Show the form for editing the specified resource.
     *
     * @param  int  $id
     * @return \Illuminate\Contracts\View\Factory|\Illuminate\Contracts\View\View|\Illuminate\Foundation\Application|object
     */
    public function edit($id)
    {
        $data = Recrutement::findOrFail($id);
        return view('backend.recrutements.edit', compact('data'));
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
        $document=$request->file('document');
      $documentName=time().'.'. $document->extension();
      $document->move('assets/docs', $documentName);
        $data = Recrutement::findOrFail($id);
        $data->title = $request->title;
        $data->description = $request->description;
        $data->date_expiration = $request->date_expiration;
        $data->link =$request->link;
        $data->document =$documentName;
        if($data->save())
        {
            return redirect()->route('recrutement.list')->with('success','Offre modifiée avec succes.');
        }
    }

    /**
     * Remove the specified resource from storage.
     *
     * @param  int  $id
     * @return \Illuminate\Http\RedirectResponse
     */
    public function destroy(Recrutement $id)
    {
        $id->delete();
        return redirect()->route('recrutement.list')->with('error','Offre supprimée avec succes');
    }




}
