# Pantela Visual CMS

Легкая визуальная CMS для статичных HTML-сайтов и лендингов.

Что умеет:
- редактировать текст прямо на странице;
- менять картинки кликом и загрузкой файла;
- менять ссылки;
- редактировать SEO title/description;
- переключаться между страницами сайта и карточками каталога;
- сохранять историю изменений и откатывать версии;
- работать на обычном PHP-хостинге без WordPress и базы данных.

## Быстрая установка

```bash
node scripts/install-visual-cms.mjs /path/to/site
```

Скрипт:
- скопирует `cms/`, `api/cms.php`, `editor.php`, `uploads/`;
- добавит подключения CMS в HTML-страницы;
- создаст `private/cms.php` с логином и паролем;
- создаст `cms/pages.json` по найденным HTML-страницам;
- добавит правила в `.htaccess`.

После установки редактор будет доступен по адресу:

```text
https://site.ru/editor
```

## Ручная установка

1. Скопируйте папки и файлы:

```text
cms/
api/cms.php
editor.php
uploads/.gitkeep
```

2. Создайте `private/cms.php`:

```php
<?php
return [
    'user' => 'admin',
    'password' => 'strong-password',
];
```

3. В `.htaccess` добавьте блок из `snippets/htaccess.txt`.

4. В каждую публичную HTML-страницу добавьте:

```html
<link rel="stylesheet" href="/cms/cms.css?v=3">
<script src="/cms/cms.js?v=3" defer></script>
```

5. Настройте страницы в `cms/pages.json`.

## Настройка списка страниц

Файл `cms/pages.json` управляет переключателем страниц в CMS:

```json
{
  "groups": [
    {
      "label": "Основные страницы",
      "items": [
        { "path": "/", "label": "Главная" },
        { "path": "/catalog.html", "label": "Каталог" }
      ]
    },
    {
      "label": "Карточки каталога",
      "items": [
        { "path": "/product-1.html", "label": "Товар 1" }
      ]
    }
  ]
}
```

Для редактирования конкретной страницы можно открыть ее с параметром `?cms`:

```text
https://site.ru/product-1.html?cms
```

## Структура данных

CMS хранит данные в файлах:

```text
cms/content.json       сохраненные правки
cms/history/           история версий
uploads/               загруженные изображения
private/cms.php        логин и пароль, не публиковать в Git
```

## Требования

- PHP 8.0+ на хостинге;
- Apache `.htaccess` с `mod_rewrite`;
- права на запись в `cms/`, `cms/history/`, `uploads/`.

## Важно

Не коммитьте `private/cms.php`, `cms/history/` и загруженные файлы, если проект публичный.
