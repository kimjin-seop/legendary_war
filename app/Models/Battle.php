<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Battle extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'state' => 'array', 'deployment' => 'array', 'result' => 'array',
            'settled_at' => 'datetime',
        ];
    }
}
