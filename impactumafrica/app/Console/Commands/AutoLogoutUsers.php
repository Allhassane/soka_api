<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;


class AutoLogoutUsers extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:auto-logout-users';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Command description';

    /**
     * Execute the console command.
     */
    public function handle()
{
    $today = now()->toDateString();

    DB::table('log_connexions')
        ->where('is_logout', false)
        ->where('login_date', $today)
        ->update([
            'logout_date' => now()->toDateString(),
            'logout_time' => now()->toTimeString(),
            'is_logout'   => true,
            'updated_at'  => now(),
            'latitude_logout' => null, // GPS non disponible si navigateur fermé
            'longitude_logout'=> null,
        ]);

    $this->info('Utilisateurs déconnectés automatiquement.');
}

}
