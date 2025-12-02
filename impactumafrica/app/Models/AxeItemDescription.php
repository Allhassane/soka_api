<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Spatie\Translatable\HasTranslations;

class AxeItemDescription extends Model
{
    use HasTranslations;
    protected $guarded = [];

    protected $with = ['domaine'];

    public function domaine()
    {
        return $this->belongsTo(Domaine::class);
    }
    //public $translatable = ['libelle', 'description'];
}
