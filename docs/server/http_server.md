---
layout: default
title: HTTP Сервер
parent: Сервер
nav_order: 3
---

Модуль для запуска сервера на nodejs на локальной машине. В основном для отладки и тестирования.

Установка:

> **npm install 'https://gitpkg.now.sh/poptlt/alto-fw/server/http_server?master'**

Используем примерно так:

```javascript
    const app = require('@alto-fw/app')

    // ...
    // собственно определяем приложение
    // ...

    const port = 8010
    const cors_client = 'http://localhost:8081'

    const http_server = require('@alto-fw/http_server')
    http_server({port, cors_client, app})    
```
В данном случае сервер будет ждать AJAX-запросы от клиента на порте 8010. Параметр **cors_client** сообщает
серверу URL страницы, с которой будут производится запросы (для настройки заголовков CORS). 
**app** - [приложение]({% link server/app.md %}), обрабатывающее запросы.
