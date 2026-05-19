<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['ok' => false, 'error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$configPath = __DIR__ . '/../private/relay.php';
if (!is_file($configPath)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Lead relay is not configured'], JSON_UNESCAPED_UNICODE);
    exit;
}

$config = require $configPath;

function clean_value($value, int $maxLength = 1500): string
{
    $text = trim((string)($value ?? ''));
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maxLength, 'UTF-8');
    }

    return substr($text, 0, $maxLength);
}

function escape_html_value(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function normalize_telegram(string $value): string
{
    $text = clean_value($value, 100);
    if ($text === '') {
        return '';
    }

    if (preg_match('/@?([a-zA-Z0-9_]{5,32})/', $text, $matches)) {
        return '@' . $matches[1];
    }

    return $text;
}

function telegram_link(string $value): string
{
    $telegram = normalize_telegram($value);
    if ($telegram === '') {
        return 'не указан';
    }

    if ($telegram[0] !== '@') {
        return escape_html_value($telegram);
    }

    $username = substr($telegram, 1);
    return '<a href="https://t.me/' . escape_html_value($username) . '">' . escape_html_value($telegram) . '</a>';
}

function build_message(array $data): string
{
    $type = clean_value($data['type'] ?? '', 200) ?: 'Заявка с сайта';
    $product = clean_value($data['product'] ?? '', 300) ?: 'Не указан';
    $name = clean_value($data['name'] ?? '', 200) ?: 'Не указано';
    $phone = clean_value($data['phone'] ?? '', 100) ?: 'Не указан';
    $email = clean_value($data['email'] ?? '', 200);
    $telegram = clean_value($data['telegram'] ?? '', 100);
    $message = clean_value($data['message'] ?? '') ?: 'Без комментария';
    $page = clean_value($data['page'] ?? '', 500) ?: 'Не указана';

    $lines = [
        '<b>Новая заявка с сайта</b>',
        '',
        '<b>Тип:</b> ' . escape_html_value($type),
        '<b>Товар:</b> ' . escape_html_value($product),
        '<b>Имя:</b> ' . escape_html_value($name),
        '<b>Телефон:</b> ' . escape_html_value($phone),
    ];

    if ($email !== '') {
        $lines[] = '<b>Email:</b> ' . escape_html_value($email);
    }

    $lines[] = '<b>Telegram:</b> ' . telegram_link($telegram);
    $lines[] = '';
    $lines[] = '<b>Запрос:</b>';
    $lines[] = escape_html_value($message);
    $lines[] = '';
    $lines[] = '<b>Страница:</b> ' . escape_html_value($page);

    return implode("\n", $lines);
}

function post_json(string $url, array $payload, string $secret): array
{
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
    $headers = [
        'Content-Type: application/json',
        'Content-Length: ' . strlen($body),
    ];

    if ($secret !== '') {
        $headers[] = 'X-Relay-Secret: ' . $secret;
    }

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => 'POST',
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);
        $responseBody = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($responseBody === false || $status < 200 || $status >= 300) {
            throw new RuntimeException($error ?: 'Relay returned HTTP ' . $status);
        }

        return json_decode((string)$responseBody, true) ?: [];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers),
            'content' => $body,
            'timeout' => 15,
        ],
    ]);
    $responseBody = file_get_contents($url, false, $context);

    if ($responseBody === false) {
        throw new RuntimeException('Relay request failed');
    }

    return json_decode((string)$responseBody, true) ?: [];
}

$rawBody = file_get_contents('php://input') ?: '';
$data = json_decode($rawBody, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON'], JSON_UNESCAPED_UNICODE);
    exit;
}

$name = clean_value($data['name'] ?? '', 200);
$phone = clean_value($data['phone'] ?? '', 100);
if ($name === '' || $phone === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Name and phone are required'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $relayUrl = clean_value($config['relay_url'] ?? '', 500);
    $relaySecret = clean_value($config['relay_secret'] ?? '', 500);
    if ($relayUrl === '') {
        throw new RuntimeException('Lead relay URL is not configured');
    }

    $payload = post_json($relayUrl, ['text' => build_message($data)], $relaySecret);
    if (($payload['ok'] ?? false) !== true) {
        throw new RuntimeException((string)($payload['message'] ?? $payload['error'] ?? 'Relay delivery failed'));
    }

    echo json_encode([
        'ok' => true,
        'databaseSaved' => false,
        'telegramSent' => (int)($payload['sent'] ?? 1),
        'telegramVia' => 'regru-php-relay',
        'telegramError' => '',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Lead delivery failed',
        'message' => $error->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
