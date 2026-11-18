<?php
// Plain PSR-4 style autoloader for App\ — no composer needed on shared hosting.
spl_autoload_register(function (string $class) {
    if (strncmp($class, 'App\\', 4) !== 0) return;
    $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, 4)) . '.php';
    if (is_file($file)) require $file;
});

App\Core\Config::load(dirname(__DIR__) . '/config/config.php');
