<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const CUSTOMER_COOKIE = 'kupola_customer_session';

function json_response(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
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
    $pdo->exec('create table if not exists customer_sessions (
        id integer primary key autoincrement,
        user_id integer not null,
        token_hash text not null unique,
        created_at text not null default CURRENT_TIMESTAMP,
        expires_at text not null,
        user_agent text,
        ip text
    )');
    $pdo->exec('create index if not exists idx_customer_users_created_at on customer_users(created_at)');
    $pdo->exec('create index if not exists idx_customer_sessions_token on customer_sessions(token_hash)');

    return $pdo;
}

function read_json(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function clean_value($value, int $maxLength = 1500): string
{
    $text = trim((string)($value ?? ''));
    return function_exists('mb_substr') ? mb_substr($text, 0, $maxLength, 'UTF-8') : substr($text, 0, $maxLength);
}

function normalize_phone($value): string
{
    $text = clean_value($value, 100);
    $digits = preg_replace('/\D+/', '', $text) ?: '';
    if ($digits === '') {
        return '';
    }
    if (strlen($digits) === 11 && $digits[0] === '8') {
        return '+7' . substr($digits, 1);
    }
    if (strlen($digits) === 11 && $digits[0] === '7') {
        return '+' . $digits;
    }
    if (strlen($digits) === 10) {
        return '+7' . $digits;
    }
    return $text;
}

function public_customer(array $row = null): ?array
{
    if (!$row) {
        return null;
    }

    return [
        'id' => (int)$row['id'],
        'created_at' => $row['created_at'] ?? '',
        'updated_at' => $row['updated_at'] ?? '',
        'last_login_at' => $row['last_login_at'] ?? '',
        'name' => $row['name'] ?? '',
        'phone' => $row['phone'] ?? '',
        'email' => $row['email'] ?? '',
        'telegram' => $row['telegram'] ?? '',
        'city' => $row['city'] ?? '',
        'company' => $row['company'] ?? '',
        'avatar' => $row['avatar'] ?? '',
    ];
}

function token_hash(string $token): string
{
    return hash('sha256', $token);
}

function create_session(PDO $pdo, int $userId): string
{
    $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $expires = gmdate('Y-m-d H:i:s', time() + 60 * 60 * 24 * 30);
    $stmt = $pdo->prepare('insert into customer_sessions (user_id, token_hash, expires_at, user_agent, ip) values (?, ?, ?, ?, ?)');
    $stmt->execute([
        $userId,
        token_hash($token),
        $expires,
        clean_value($_SERVER['HTTP_USER_AGENT'] ?? '', 500),
        clean_value($_SERVER['REMOTE_ADDR'] ?? '', 100),
    ]);
    setcookie(CUSTOMER_COOKIE, $token, [
        'expires' => time() + 60 * 60 * 24 * 30,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    ]);
    return $token;
}

function current_customer(PDO $pdo): ?array
{
    $token = (string)($_COOKIE[CUSTOMER_COOKIE] ?? '');
    if ($token === '') {
        return null;
    }

    $stmt = $pdo->prepare("select u.* from customer_sessions s join customer_users u on u.id = s.user_id where s.token_hash = ? and datetime(s.expires_at) > datetime('now') limit 1");
    $stmt->execute([token_hash($token)]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return public_customer($row ?: null);
}

function require_customer(PDO $pdo): array
{
    $customer = current_customer($pdo);
    if (!$customer) {
        json_response(401, ['ok' => false, 'error' => 'Unauthorized']);
    }
    return $customer;
}

try {
    $pdo = db();
    $action = clean_value($_GET['action'] ?? '', 40);

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'me') {
        $customer = current_customer($pdo);
        json_response(200, ['ok' => true, 'authenticated' => (bool)$customer, 'customer' => $customer]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        header('Allow: GET, POST');
        json_response(405, ['ok' => false, 'error' => 'Method not allowed']);
    }

    $data = read_json();

    if ($action === 'register') {
        $name = clean_value($data['name'] ?? '', 200);
        $phone = normalize_phone($data['phone'] ?? '');
        $email = strtolower(clean_value($data['email'] ?? '', 200));
        $password = (string)($data['password'] ?? '');

        if ($name === '' || $phone === '' || strlen($password) < 4) {
            json_response(400, ['ok' => false, 'error' => 'name_phone_password_required']);
        }

        $stmt = $pdo->prepare('insert into customer_users (name, phone, email, telegram, city, company, avatar, password_hash) values (?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $name,
            $phone,
            $email !== '' ? $email : null,
            clean_value($data['telegram'] ?? '', 100),
            clean_value($data['city'] ?? '', 200),
            clean_value($data['company'] ?? '', 200),
            clean_value($data['avatar'] ?? '', 300000),
            password_hash($password, PASSWORD_DEFAULT),
        ]);
        $id = (int)$pdo->lastInsertId();
        create_session($pdo, $id);
        $stmt = $pdo->prepare('select * from customer_users where id = ?');
        $stmt->execute([$id]);
        json_response(200, ['ok' => true, 'customer' => public_customer($stmt->fetch(PDO::FETCH_ASSOC))]);
    }

    if ($action === 'login') {
        $login = clean_value($data['login'] ?? $data['phone'] ?? $data['email'] ?? '', 200);
        $phone = normalize_phone($login);
        $email = strtolower($login);
        $stmt = $pdo->prepare('select * from customer_users where phone = ? or email = ? limit 1');
        $stmt->execute([$phone, $email]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row || !password_verify((string)($data['password'] ?? ''), (string)$row['password_hash'])) {
            json_response(401, ['ok' => false, 'error' => 'bad_credentials']);
        }

        $pdo->prepare('update customer_users set last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP where id = ?')->execute([(int)$row['id']]);
        create_session($pdo, (int)$row['id']);
        $stmt = $pdo->prepare('select * from customer_users where id = ?');
        $stmt->execute([(int)$row['id']]);
        json_response(200, ['ok' => true, 'customer' => public_customer($stmt->fetch(PDO::FETCH_ASSOC))]);
    }

    if ($action === 'logout') {
        $token = (string)($_COOKIE[CUSTOMER_COOKIE] ?? '');
        if ($token !== '') {
            $pdo->prepare('delete from customer_sessions where token_hash = ?')->execute([token_hash($token)]);
        }
        setcookie(CUSTOMER_COOKIE, '', ['expires' => time() - 3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
        json_response(200, ['ok' => true]);
    }

    if ($action === 'profile') {
        $customer = require_customer($pdo);
        $name = clean_value($data['name'] ?? '', 200);
        $phone = normalize_phone($data['phone'] ?? '');
        $email = strtolower(clean_value($data['email'] ?? '', 200));
        if ($name === '' || $phone === '') {
            json_response(400, ['ok' => false, 'error' => 'name_phone_required']);
        }

        $stmt = $pdo->prepare('update customer_users set name = ?, phone = ?, email = ?, telegram = ?, city = ?, company = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP where id = ?');
        $stmt->execute([
            $name,
            $phone,
            $email !== '' ? $email : null,
            clean_value($data['telegram'] ?? '', 100),
            clean_value($data['city'] ?? '', 200),
            clean_value($data['company'] ?? '', 200),
            clean_value($data['avatar'] ?? '', 300000),
            (int)$customer['id'],
        ]);
        $stmt = $pdo->prepare('select * from customer_users where id = ?');
        $stmt->execute([(int)$customer['id']]);
        json_response(200, ['ok' => true, 'customer' => public_customer($stmt->fetch(PDO::FETCH_ASSOC))]);
    }

    if ($action === 'password') {
        $customer = require_customer($pdo);
        $password = (string)($data['password'] ?? '');
        if (strlen($password) < 4) {
            json_response(400, ['ok' => false, 'error' => 'bad_password']);
        }
        $pdo->prepare('update customer_users set password_hash = ?, updated_at = CURRENT_TIMESTAMP where id = ?')->execute([
            password_hash($password, PASSWORD_DEFAULT),
            (int)$customer['id'],
        ]);
        json_response(200, ['ok' => true]);
    }

    json_response(404, ['ok' => false, 'error' => 'Unknown action']);
} catch (PDOException $error) {
    $message = str_contains($error->getMessage(), 'UNIQUE') ? 'customer_exists' : 'customer_request_failed';
    json_response($message === 'customer_exists' ? 409 : 500, ['ok' => false, 'error' => $message]);
} catch (Throwable $error) {
    json_response(500, ['ok' => false, 'error' => 'customer_request_failed']);
}
