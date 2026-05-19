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

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
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
