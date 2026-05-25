<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['ok' => false, 'error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

function clean_chat_value($value, int $maxLength = 1500): string
{
    $text = trim((string)($value ?? ''));
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maxLength, 'UTF-8');
    }

    return substr($text, 0, $maxLength);
}

function escape_chat_html(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function read_max_config(): array
{
    $config = [];
    $configPath = __DIR__ . '/../private/max.php';
    if (is_file($configPath)) {
        $loaded = require $configPath;
        if (is_array($loaded)) {
            $config = $loaded;
        }
    }

    return [
        'token' => clean_chat_value($config['token'] ?? $config['bot_token'] ?? getenv('MAX_BOT_TOKEN') ?: '', 500),
        'chat_id' => clean_chat_value($config['chat_id'] ?? getenv('MAX_CHAT_ID') ?: '', 100),
        'user_id' => clean_chat_value($config['user_id'] ?? getenv('MAX_USER_ID') ?: '', 100),
    ];
}

function build_chat_message(array $data): string
{
    $name = clean_chat_value($data['name'] ?? '', 120) ?: 'Не указано';
    $contact = clean_chat_value($data['contact'] ?? '', 160) ?: 'Не указан';
    $message = clean_chat_value($data['message'] ?? '', 2800);
    $page = clean_chat_value($data['page'] ?? '', 500) ?: 'Не указана';

    return implode("\n", [
        '<b>Новый вопрос с сайта</b>',
        '',
        '<b>Имя:</b> ' . escape_chat_html($name),
        '<b>Контакт:</b> ' . escape_chat_html($contact),
        '',
        '<b>Вопрос:</b>',
        escape_chat_html($message),
        '',
        '<b>Страница:</b> ' . escape_chat_html($page),
    ]);
}

function save_chat_message(array $data): void
{
    $dir = __DIR__ . '/../data';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $row = [
        'created_at' => gmdate('c'),
        'name' => clean_chat_value($data['name'] ?? '', 120),
        'contact' => clean_chat_value($data['contact'] ?? '', 160),
        'message' => clean_chat_value($data['message'] ?? '', 2800),
        'page' => clean_chat_value($data['page'] ?? '', 500),
        'ip' => clean_chat_value($_SERVER['REMOTE_ADDR'] ?? '', 80),
        'user_agent' => clean_chat_value($_SERVER['HTTP_USER_AGENT'] ?? '', 500),
    ];

    file_put_contents(
        $dir . '/chat-messages.ndjson',
        json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n",
        FILE_APPEND | LOCK_EX
    );
}

function post_max_message(array $config, string $text): array
{
    if ($config['token'] === '') {
        throw new RuntimeException('MAX bot token is not configured');
    }

    $recipient = '';
    if ($config['chat_id'] !== '') {
        $recipient = 'chat_id=' . rawurlencode($config['chat_id']);
    } elseif ($config['user_id'] !== '') {
        $recipient = 'user_id=' . rawurlencode($config['user_id']);
    }

    if ($recipient === '') {
        throw new RuntimeException('MAX chat_id or user_id is not configured');
    }

    $url = 'https://platform-api.max.ru/messages?' . $recipient . '&disable_link_preview=true';
    $body = json_encode([
        'text' => $text,
        'format' => 'html',
        'notify' => true,
    ], JSON_UNESCAPED_UNICODE);

    $headers = [
        'Authorization: ' . $config['token'],
        'Content-Type: application/json',
        'Content-Length: ' . strlen($body),
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
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
            throw new RuntimeException($error ?: 'MAX returned HTTP ' . $status);
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
        throw new RuntimeException('MAX request failed');
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

$contact = clean_chat_value($data['contact'] ?? '', 160);
$message = clean_chat_value($data['message'] ?? '', 2800);
if ($contact === '' || $message === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Contact and message are required'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    save_chat_message($data);
    post_max_message(read_max_config(), build_chat_message($data));
    echo json_encode(['ok' => true, 'sentVia' => 'max'], JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'MAX delivery failed',
        'message' => $error->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
