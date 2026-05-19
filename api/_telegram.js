const https = require('node:https');
const { HttpsProxyAgent } = require('https-proxy-agent');

function cleanTelegramValue(value) {
  return String(value || '').trim();
}

function getBotToken() {
  const token = cleanTelegramValue(process.env.TELEGRAM_BOT_TOKEN);
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  return token;
}

function getRecipientChatIds() {
  const ids = [
    ...cleanTelegramValue(process.env.TELEGRAM_CHAT_ID).split(','),
    ...cleanTelegramValue(process.env.TELEGRAM_CHAT_IDS).split(','),
  ]
    .map((id) => id.trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}

function getTelegramProxyAgent() {
  const proxyUrl = cleanTelegramValue(process.env.TELEGRAM_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
  return proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
}

function postJson(url, body, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 5000);
  const payload = JSON.stringify(body);
  const target = new URL(url);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        agent: getTelegramProxyAgent(),
        headers: {
          'Content-Length': Buffer.byteLength(payload),
          'Content-Type': 'application/json',
        },
        hostname: target.hostname,
        method: 'POST',
        path: `${target.pathname}${target.search}`,
        port: target.port || 443,
        protocol: target.protocol,
        timeout: timeoutMs,
      },
      (response) => {
        let responseBody = '';

        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(responseBody || '{}'));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('Telegram request timed out'));
    });
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

async function sendTelegramMessage(chatId, text, options = {}) {
  const token = getBotToken();
  const body = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };

  if (options.parseMode !== null) {
    body.parse_mode = options.parseMode || 'HTML';
  }

  const payload = await postJson(`https://api.telegram.org/bot${token}/sendMessage`, body, options);
  if (!payload.ok) {
    throw new Error(payload.description || 'Telegram sendMessage failed');
  }

  return payload.result;
}

async function sendTelegramMessageToRecipients(text, options = {}) {
  const chatIds = getRecipientChatIds();
  if (!chatIds.length) {
    throw new Error('Telegram recipient is not configured. Set TELEGRAM_CHAT_ID or TELEGRAM_CHAT_IDS.');
  }

  const results = [];
  for (const chatId of chatIds) {
    results.push(await sendTelegramMessage(chatId, text, options));
  }

  return results;
}

module.exports = {
  getBotToken,
  getRecipientChatIds,
  sendTelegramMessage,
  sendTelegramMessageToRecipients,
};
