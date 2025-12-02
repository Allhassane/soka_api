<?php

namespace App\Livewire;

use App\Models\Actualite;
use Livewire\Component;

class CompteurActualite extends Component
{
    public function render()
    {
        $nombre = Actualite::count();
        return view('livewire.compteur-actualite', compact('nombre'));
    }
}
