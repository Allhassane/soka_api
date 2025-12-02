<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * Les commandes Artisan de l'application.
     *
     * @var array<int, class-string|string>
     */
    protected $commands = [
        // Ici tu peux enregistrer tes commandes artisan personnalisées
        \App\Console\Commands\AutoLogoutUsers::class,
    ];

    /**
     * Définir le planificateur des tâches de l'application.
     */
    protected function schedule(Schedule $schedule): void
    {
        // Exemple : exécuter la commande AutoLogoutUsers tous les jours à 19h00
        $schedule->command('autologout:users')->dailyAt('17:43');
    }

    /**
     * Enregistrer les commandes artisan de l'application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}
