<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;


class LogConnexion extends Model
{
    protected $table = 'log_connexions';

    protected $guarded = [];

    protected $casts = [
        'login_date'  => 'date',
        'logout_date' => 'date',
        'is_login'    => 'boolean',
        'is_logout'   => 'boolean',
        'latitude'    => 'float',
        'longitude'   => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
