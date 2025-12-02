<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Spatie\Translatable\HasTranslations;

class Equipe extends Model
{
    use HasTranslations;
    protected $guarded = [];

     // Liste des attributs traduisibles (à adapter à ton schéma)
    // public $translatable = ['fonction'];
}
