<?php
declare(strict_types=1);

header('Cache-Control: no-store');

function json_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function admin_config(): array
{
    $configPath = dirname(__DIR__) . '/private/admin.php';
    if (is_file($configPath)) {
        $config = require $configPath;
        if (is_array($config)) {
            return ['token' => (string)($config['token'] ?? '')];
        }
    }

    $relayPath = dirname(__DIR__) . '/private/relay.php';
    if (is_file($relayPath)) {
        $relay = require $relayPath;
        if (is_array($relay)) {
            return ['token' => (string)($relay['admin_token'] ?? $relay['token'] ?? '')];
        }
    }

    return ['token' => getenv('LEADS_ADMIN_TOKEN') ?: ''];
}

function require_admin(): void
{
    $token = admin_config()['token'];
    $given = (string)($_GET['token'] ?? '');

    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($given === '' && preg_match('/^Bearer\s+(.+)$/i', $auth, $matches)) {
        $given = trim($matches[1]);
    }

    if ($token !== '' && hash_equals($token, $given)) {
        return;
    }

    json_response(401, ['ok' => false, 'error' => 'Unauthorized']);
}

function db(): PDO
{
    $dir = dirname(__DIR__) . '/private';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $pdo = new PDO('sqlite:' . $dir . '/customers.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('create table if not exists customer_users (
        id integer primary key autoincrement,
        created_at text not null default CURRENT_TIMESTAMP,
        updated_at text not null default CURRENT_TIMESTAMP,
        last_login_at text,
        name text not null,
        phone text not null unique,
        email text unique,
        telegram text,
        city text,
        company text,
        avatar text,
        password_hash text not null
    )');
    return $pdo;
}

function date_value($value): string
{
    $text = trim((string)($value ?? ''));
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $text) ? $text : '';
}

function build_filter(array $params): array
{
    $where = [];
    $args = [];
    $from = date_value($params['date_from'] ?? '');
    $to = date_value($params['date_to'] ?? '');

    if ($from !== '') {
        $where[] = 'date(created_at) >= date(?)';
        $args[] = $from;
    }
    if ($to !== '') {
        $where[] = 'date(created_at) <= date(?)';
        $args[] = $to;
    }

    return [
        'sql' => $where ? 'where ' . implode(' and ', $where) : '',
        'args' => $args,
    ];
}

function csv_value($value): string
{
    return '"' . str_replace('"', '""', (string)($value ?? '')) . '"';
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        header('Allow: GET');
        json_response(405, ['ok' => false, 'error' => 'Method not allowed']);
    }

    require_admin();
    $pdo = db();
    $filter = build_filter($_GET);
    $limit = min(max((int)($_GET['limit'] ?? 500), 1), 2000);

    $stmt = $pdo->prepare('select id, created_at, updated_at, last_login_at, name, phone, email, telegram, city, company from customer_users ' . $filter['sql'] . ' order by datetime(created_at) desc limit ?');
    $index = 1;
    foreach ($filter['args'] as $arg) {
        $stmt->bindValue($index++, $arg, PDO::PARAM_STR);
    }
    $stmt->bindValue($index, $limit, PDO::PARAM_INT);
    $stmt->execute();
    $customers = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    if (($_GET['format'] ?? '') === 'csv') {
        $columns = [
            ['ID', 'id'],
            ['Дата регистрации', 'created_at'],
            ['Имя', 'name'],
            ['Телефон', 'phone'],
            ['Email', 'email'],
            ['Telegram', 'telegram'],
            ['Город', 'city'],
            ['Компания', 'company'],
            ['Последний вход', 'last_login_at'],
        ];
        $lines = [implode(';', array_map(fn($col) => csv_value($col[0]), $columns))];
        foreach ($customers as $customer) {
            $lines[] = implode(';', array_map(fn($col) => csv_value($customer[$col[1]] ?? ''), $columns));
        }
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="customers.csv"');
        echo "\xEF\xBB\xBF" . implode("\n", $lines);
        exit;
    }

    $total = (int)$pdo->query('select count(*) from customer_users')->fetchColumn();
    $stmt = $pdo->prepare('select count(*) from customer_users ' . $filter['sql']);
    $stmt->execute($filter['args']);
    $periodTotal = (int)$stmt->fetchColumn();
    $today = (int)$pdo->query("select count(*) from customer_users where date(created_at) = date('now')")->fetchColumn();

    json_response(200, [
        'ok' => true,
        'customers' => $customers,
        'stats' => [
            'total' => $total,
            'periodTotal' => $periodTotal,
            'today' => $today,
        ],
    ]);
} catch (Throwable $error) {
    json_response(500, ['ok' => false, 'error' => 'Customers read failed']);
}
