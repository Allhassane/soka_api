<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Spatie\Translatable\HasTranslations;

class Domaine extends Model
{
    use HasTranslations;
    protected $guarded = [];

    protected $table = 'domaines';

    public function sousaxes()
    {
        return $this->hasMany(AxeItemDescription::class);
    }

     //public $translatable = ['title', 'description'];

}
