# Kupola Landing

Статический сайт-каталог с Node.js API для заявок, админки и Telegram-бота.

## Продакшн

Рабочий сервер: `http://5.42.99.128/`

Приложение на сервере:

- каталог: `/var/www/kupola-landing`
- сервис: `kupola-landing.service`
- env-файл: `/etc/kupola-landing.env`
- база заявок: `/var/www/kupola-landing/data/leads.sqlite`
- nginx проксирует сайт на `127.0.0.1:3000`

## Структура

- `index.html` — главная страница каталога.
- `*-minaret.html`, `crescent-*.html`, `spherical-*.html` — страницы товаров.
- `videos.html` — страница видео.
- `admin.html` — закрытая страница статистики и выгрузки заявок.
- `server.js` — Node.js сервер для VPS.
- `api/lead.js` — прием заявки, сохранение в SQLite и попытка отправки в Telegram.
- `api/leads.js` — список заявок в JSON.
- `api/stats.js` — статистика заявок.
- `api/export.js` — выгрузка заявок в CSV.
- `api/telegram-webhook.js` — webhook Telegram-бота.
- `assets/landing.css` — стили.
- `assets/landing.js` — интерактивность каталога, форм и видео.

## Переменные окружения

Обязательные для заявок и админки:

- `LEADS_ADMIN_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Опциональные:

- `TELEGRAM_CHAT_IDS` — дополнительные получатели заявок через запятую.
- `TELEGRAM_WEBHOOK_SECRET` — секрет webhook для Telegram.
- `DATABASE_URL` и `DATABASE_AUTH_TOKEN` — внешний SQLite/libSQL, если понадобится вместо локального файла.

## Админка

- Страница: `/admin.html`
- Статистика: `/api/stats?token=...`
- Список заявок: `/api/leads?token=...`
- CSV: `/api/export?token=...`

## Деплой на VPS

```bash
cd /var/www/kupola-landing
git fetch origin main
git reset --hard origin/main
npm ci --omit=dev
systemctl restart kupola-landing
```

После деплоя проверить:

```bash
systemctl is-active kupola-landing
curl -I http://127.0.0.1/
```
