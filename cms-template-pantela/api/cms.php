<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$contentPath = $root . '/cms/content.json';
$historyDir = $root . '/cms/history';
$uploadsDir = $root . '/uploads';

function cms_config(): array
{
    $configPath = dirname(__DIR__) . '/private/cms.php';
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

function json_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
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
    json_response(401, ['ok' => false, 'error' => 'auth_required']);
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_response(400, ['ok' => false, 'error' => 'bad_json']);
    }
    return $data;
}

function history_name(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH-i-s-u\Z') . '.json';
}

function backup_content(string $contentPath, string $historyDir): void
{
    if (!is_file($contentPath)) {
        return;
    }

    $current = file_get_contents($contentPath);
    if ($current === false || $current === '') {
        return;
    }

    if (!is_dir($historyDir)) {
        mkdir($historyDir, 0775, true);
    }

    file_put_contents($historyDir . '/' . history_name(), $current, LOCK_EX);
    $files = glob($historyDir . '/*.json') ?: [];
    sort($files, SORT_STRING);

    while (count($files) > 30) {
        $oldest = array_shift($files);
        if ($oldest) {
            @unlink($oldest);
        }
    }
}

function history_items(string $historyDir): array
{
    $files = glob($historyDir . '/*.json') ?: [];
    rsort($files, SORT_STRING);
    $items = [];

    foreach (array_slice($files, 0, 50) as $file) {
        $json = json_decode((string)file_get_contents($file), true);
        $items[] = [
            'id' => basename($file),
            'savedAt' => date(DATE_ATOM, (int)filemtime($file)),
            'updatedAt' => is_array($json) ? ($json['updatedAt'] ?? null) : null,
            'itemCount' => is_array($json) && isset($json['items']) && is_array($json['items']) ? count($json['items']) : 0,
            'size' => (int)filesize($file),
        ];
    }

    return $items;
}

function safe_history_id(mixed $id): ?string
{
    $name = basename((string)$id);
    return preg_match('/^[0-9TZa-zA-Z._-]+\.json$/', $name) ? $name : null;
}

function safe_upload_filename(string $name): string
{
    $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $extension = preg_replace('/[^a-z0-9]/', '', $extension) ?: 'png';
    $base = strtolower(pathinfo($name, PATHINFO_FILENAME));
    $base = preg_replace('/[^a-z0-9_-]+/', '-', $base) ?: 'image';
    $base = trim(substr($base, 0, 60), '-_') ?: 'image';
    return time() . '-' . $base . '.' . $extension;
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET' && $action === 'content') {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if (is_file($contentPath)) {
        readfile($contentPath);
    } else {
        echo '{"version":1,"items":{}}';
    }
    exit;
}

if ($action === 'session' || $action === 'history' || $action === 'undo' || $action === 'restore' || $method !== 'GET') {
    require_cms_auth();
}

if ($method === 'GET' && $action === 'session') {
    $config = cms_config();
    json_response(200, ['ok' => true, 'user' => $config['user'], 'authEnabled' => $config['password'] !== '']);
}

if ($method === 'GET' && $action === 'history') {
    json_response(200, ['ok' => true, 'items' => history_items($historyDir)]);
}

if ($method === 'POST' && $action === 'content') {
    $data = read_json_body();
    $safe = [
        'version' => 1,
        'updatedAt' => gmdate(DATE_ATOM),
        'items' => isset($data['items']) && is_array($data['items']) ? $data['items'] : [],
    ];

    if (!is_dir(dirname($contentPath))) {
        mkdir(dirname($contentPath), 0775, true);
    }

    backup_content($contentPath, $historyDir);
    file_put_contents($contentPath, json_encode($safe, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL, LOCK_EX);
    json_response(200, ['ok' => true]);
}

if ($method === 'POST' && $action === 'upload') {
    $data = read_json_body();
    $dataUrl = (string)($data['dataUrl'] ?? '');

    if (!preg_match('/^data:(image\/(?:png|jpe?g|webp|svg\+xml|avif));base64,(.+)$/', $dataUrl, $matches)) {
        json_response(400, ['ok' => false, 'error' => 'bad_image']);
    }

    $binary = base64_decode($matches[2], true);
    if ($binary === false) {
        json_response(400, ['ok' => false, 'error' => 'bad_image']);
    }

    if (!is_dir($uploadsDir)) {
        mkdir($uploadsDir, 0775, true);
    }

    $filename = safe_upload_filename((string)($data['filename'] ?? 'image.png'));
    file_put_contents($uploadsDir . '/' . $filename, $binary, LOCK_EX);
    json_response(200, ['ok' => true, 'path' => '/uploads/' . $filename]);
}

if ($method === 'POST' && $action === 'undo') {
    $files = glob($historyDir . '/*.json') ?: [];
    sort($files, SORT_STRING);
    $latest = end($files);
    if (!$latest) {
        json_response(409, ['ok' => false, 'error' => 'no_history']);
    }

    file_put_contents($contentPath, (string)file_get_contents($latest), LOCK_EX);
    @unlink($latest);
    json_response(200, ['ok' => true]);
}

if ($method === 'POST' && $action === 'restore') {
    $data = read_json_body();
    $id = safe_history_id($data['id'] ?? '');
    if (!$id) {
        json_response(400, ['ok' => false, 'error' => 'bad_history_id']);
    }

    $file = $historyDir . '/' . $id;
    if (!is_file($file)) {
        json_response(404, ['ok' => false, 'error' => 'history_not_found']);
    }

    backup_content($contentPath, $historyDir);
    file_put_contents($contentPath, (string)file_get_contents($file), LOCK_EX);
    json_response(200, ['ok' => true, 'restored' => $id]);
}

json_response(404, ['ok' => false, 'error' => 'not_found']);
