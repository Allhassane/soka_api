<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class AdminController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        //
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        //
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
    public function destroy(string $id)
    {
        //
    }

    public function listUser()
    {
        $datas = User::where('role','!=','SuperAdmin')->where('role','!=','Admin')
            ->where('id','!=',\Auth::user()->id)->get();
        return view('backend.users.list', compact('datas'));
    }

    public function storeUser(Request $request)
    {
        $validator=Validator::make($request->all(),
            [
                'email'=>'unique:users'
            ]);
        $validator1=Validator::make($request->all(),
            [
                'password'=>'confirmed'
            ]);
        if($validator->fails())
        {
            return back()->withInput()->with('error','Cette adresse email existe déja!');
        }
        elseif($validator1->fails())
        {
            return back()->withInput()->with('error','Mots de passe ne sont pas identiques!');
        }
        else
        {
            User::create(
                [
                    'name' => $request->name,
                    'email' => $request->email,
                    'password' => Hash::make($request->password),
                    'token' => $request->password,
                ]
            );
            return redirect()->back()->with('success','Utilisateur ajouté avec succes.');
        }
    }

    public function updateUser(Request $request, $id)
    {
        if($request->password!=$request->password_confirmation)
        {
            return redirect()->back()->with('error','Les mots de passe ne correspondent pas');
        }
        $data = User::findOrFail($id);
        $data->name = $request->name;
        $data->email = $request->email;
        $data->password = Hash::make($request->password);
        if($data->save())
        {
            return redirect()->back()->with('success','Utilisateur modifié avec succes .');
        }
    }

    public function destroyUser(User $id)
    {
        $id->delete();
        return redirect()->back()->with('success','Utilisateur supprimé avec succes .');
    }

}
