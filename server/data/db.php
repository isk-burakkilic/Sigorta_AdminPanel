<?php
// ============================================================
//  db.php — Database connection (zero hardcoded credentials)
// ============================================================
require_once __DIR__ . '/env.php';

function getDB(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;

    $host    = env('DB_HOST',    'localhost');
    $name    = env('DB_NAME');
    $user    = env('DB_USER');
    $pass    = env('DB_PASS');
    $charset = env('DB_CHARSET', 'utf8mb4');

    if (!$name || !$user || !$pass) {
        throw new RuntimeException('Database credentials missing. Check .env file.');
    }

    $dsn = "mysql:host=$host;dbname=$name;charset=$charset";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    return $pdo;
}