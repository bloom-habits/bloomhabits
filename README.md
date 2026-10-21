# Habits — Telegram Mini App

Трекер привычек. Дизайн и приложение — `index.html` (без изменений). Сервер — `server.js` (нужен для облака, напоминаний и «Поделиться»).

## Запуск
1. Установите Node.js 18+.
2. В Telegram создайте бота у @BotFather (`/newbot`), скопируйте токен.
3. `cp .env.example .env` и заполните `BOT_TOKEN`, `BOT_USERNAME`.
4. `node server.js` — сервер на http://localhost:3000.
5. Приложению нужен **HTTPS-адрес**. Для проверки: `cloudflared tunnel --url http://localhost:3000` или `ngrok http 3000`. Для постоянной работы — VPS, Render, Railway или Fly.io.
6. В @BotFather: `/newapp` (или `/setmenubutton`) -> вставьте HTTPS-адрес. Короткое имя Mini App впишите в `APP_SHORT_NAME`.
7. Откройте бота, нажмите `/start` и кнопку «Открыть Habits».

## Что работает
- Тема Telegram (светлая/тёмная) -> тема приложения, цвета шапки Telegram.
- Облачная синхронизация между устройствами (Telegram CloudStorage, сервер не нужен).
- Напоминания через бота: включаются в настройках приложения, время и «тихие часы» учитывают часовой пояс.
- «Поделиться»: ссылка `t.me/<бот>/<app>?startapp=ref_<id>`, рефералы считаются в `data.json`.

## Проверка
`GET /health` вернёт `ok`. Без `BOT_TOKEN` сервер отдаёт приложение, но `/api/settings` отвечает 401.
