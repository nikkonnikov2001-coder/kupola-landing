# Kupola Landing

Статический сайт-каталог для минаретов, куполов, полумесяцев, листов и комплектующих.

## Структура

- `index.html` — главная страница каталога.
- `*-minaret.html`, `crescent-*.html`, `spherical-*.html` — страницы товаров.
- `videos.html` — страница видео.
- `admin.html` — закрытая страница статистики и выгрузки заявок.
- `api/lead.js` — прием заявки, сохранение в SQLite/libSQL и отправка в Telegram.
- `api/leads.js` — список заявок в JSON.
- `api/stats.js` — статистика заявок.
- `api/export.js` — выгрузка заявок в CSV.
- `assets/landing.css` — стили.
- `assets/landing.js` — интерактивность каталога, форм и видео.

## Переменные окружения

Обязательные для Telegram:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Обязательная для доступа к админке:

- `LEADS_ADMIN_TOKEN`

Для постоянной SQLite-базы на Vercel нужен внешний SQLite/libSQL:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

Без Turso/libSQL локально используется `data/leads.sqlite`. На Vercel обычный SQLite-файл не является постоянным хранилищем, поэтому для сохранения заявок между функциями и деплоями нужен внешний libSQL.

## Админка

- Страница: `/admin.html`
- Статистика: `/api/stats?token=...`
- Список заявок: `/api/leads?token=...`
- CSV: `/api/export?token=...`

## Публикация

Сайт развернут на Vercel:
https://files-mentioned-by-the-user-jpg.vercel.app
