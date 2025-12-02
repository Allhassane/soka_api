<?php

// Inclure les fichiers de bootstrap Laravel
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';

use Illuminate\Contracts\Console\Kernel;

// Boot Laravel
$kernel = $app->make(Kernel::class);

// Exécution des commandes Artisan
$kernel->call('route:clear');
$kernel->call('cache:clear');
$kernel->call('config:clear');
$kernel->call('config:cache');

// Afficher un message
echo "<h2 style='color: green;'>✔ Tous les caches ont été vidés avec succès !</h2>";
