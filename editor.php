<?php
declare(strict_types=1);

function cms_config(): array
{
    $configPath = __DIR__ . '/private/cms.php';
    if (is_file($configPath)) {
        $config = require $configPath;
        if (is_array($config)) {
            return [
                'user' => (string)($config['user'] ?? 'admin'),
                'password' => (string)($config['password'] ?? ''),
            ];
        }
    }

    return [
        'user' => getenv('CMS_USER') ?: 'admin',
        'password' => getenv('CMS_PASSWORD') ?: '',
    ];
}

function require_cms_auth(): void
{
    $config = cms_config();
    $password = $config['password'];
    $user = $config['user'];
    $givenUser = $_SERVER['PHP_AUTH_USER'] ?? '';
    $givenPassword = $_SERVER['PHP_AUTH_PW'] ?? '';

    if ($givenUser === '' && isset($_SERVER['HTTP_AUTHORIZATION']) && preg_match('/^Basic\s+(.+)$/i', (string)$_SERVER['HTTP_AUTHORIZATION'], $matches)) {
        $decoded = base64_decode($matches[1], true);
        if (is_string($decoded) && str_contains($decoded, ':')) {
            [$givenUser, $givenPassword] = explode(':', $decoded, 2);
        }
    }

    if ($password !== '' && hash_equals($user, $givenUser) && hash_equals($password, $givenPassword)) {
        return;
    }

    header('WWW-Authenticate: Basic realm="Visual CMS"');
    header('HTTP/1.1 401 Unauthorized');
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo 'CMS auth required';
    exit;
}

require_cms_auth();

$indexPath = __DIR__ . '/index.html';
if (!is_file($indexPath)) {
    http_response_code(404);
    echo 'Not found';
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
readfile($indexPath);
