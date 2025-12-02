<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Spatie\Translatable\HasTranslations;

class Projet extends Model
{
    use HasTranslations;
    protected $guarded = [];

    //public $translatable = ['title', 'description','info','commentaire'];
}
