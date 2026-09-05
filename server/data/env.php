<?php
// ============================================================
//  env.php — Loads .env file into $_ENV
//  USAGE: require_once __DIR__ . '/env.php';
//
//  Place your .env file ONE level above web root, e.g.:
//    /home/youraccount/.env          ← ideal (not web-accessible)
//    /home/youraccount/public_html/  ← web root
//
//  Adjust ENV_PATH below to match your server layout.
// ============================================================

define('ENV_PATH', dirname(__DIR__) . '/.env');   // one level above web root

function loadEnv(): void {
    static $loaded = false;
    if ($loaded) return;

    if (!file_exists(ENV_PATH)) {
        // Fallback: same directory (less secure, but functional)
        $fallback = __DIR__ . '/.env';
        if (!file_exists($fallback)) {
            throw new RuntimeException('.env file not found. Expected: ' . ENV_PATH);
        }
        $path = $fallback;
    } else {
        $path = ENV_PATH;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
    if ($line === '' || strpos($line, '#') === 0) continue;
        if (strpos($line, '=') === false) continue;
        [$key, $value] = explode('=', $line, 2);
        $key   = trim($key);
        $value = trim($value);

        // Strip surrounding quotes if present
        if (preg_match('/^(["\'])(.*)\\1$/', $value, $m)) {
            $value = $m[2];
        }

        $_ENV[$key]    = $value;
        putenv("$key=$value");
    }
    $loaded = true;
}

function env(string $key, $default = null): ?string {
    loadEnv();
    return $_ENV[$key] ?? getenv($key) ?: $default;
}