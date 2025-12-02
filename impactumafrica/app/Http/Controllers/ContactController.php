<?php

namespace App\Http\Controllers;

use App\Mail\ContactMail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class ContactController extends Controller
{
    /**
     * Display a listing of the resource.
     *
     * @return \Illuminate\Http\Response
     */


    public function index()
    {
        //
    }


    public function contact()
    {
        return view('front_end.contact');
    }

    public function storeContact(Request $request)
    {
        
          $validated = $request->validate([
        'name'    => 'required|string|min:2|max:120',
        'email'   => 'required|email|max:150',
        'phone'   => 'required|string|min:6|max:50',
        'subject' => 'required|string|max:150',
        'message' => 'required|string|min:10|max:5000',
    ]);

    // 2. Sauvegarder dans la base de données
    DB::table('contacts')->insert([
        'nom'        => $validated['name'],
        'email'      => $validated['email'],
        'contact'    => $validated['phone'],
        'sujet'      => $validated['subject'],
        'message'    => $validated['message'],
        'statut'     => 0,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    // 3. Envoyer un email
    Mail::to('contact@impactum.africa')->send(new ContactMail($validated));

    // 4. Retourner un message de succès
    return redirect()->back()->with('success', 'Votre message a bien été envoyé, nous vous contacterons très bientôt.');

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
     * @return \Illuminate\Http\Response
     */
    public function store(Request $request)
    {
        //
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
     * @return \Illuminate\Http\Response
     */
    public function update(Request $request, $id)
    {
        //
    }

    /**
     * Remove the specified resource from storage.
     *
     * @param  int  $id
     * @return \Illuminate\Http\Response
     */
    public function destroy($id)
    {
        //
    }



}
