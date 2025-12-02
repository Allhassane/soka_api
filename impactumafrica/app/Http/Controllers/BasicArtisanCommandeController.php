<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

class BasicArtisanCommandeController extends Controller
{
    public function config_clear()
    {
        Artisan::call('config:clear');
        return view('front_end.all_commande_artisan');
    }

}
