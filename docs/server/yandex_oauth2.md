---
layout: default
title: Yandex OAUTH2
parent: Сервер
nav_order: 5
---

Раз фреймворк в основном строится на технологиях Яндекса, 
то логично и систему авторизации пользователей взять у [того же Яндекса](https://yandex.ru/dev/id/doc/ru/concepts/ya-oauth-intro).

Чтобы воспользоваться этой функциональностью необходимо зарегистрировать наше клиентское приложение в [Яндекс OAuth](https://oauth.yandex.ru/).

В запрашиваемых правах указать **Доступ к логину, имени и фамилии, полу**.
В **Redirect URI для веб-сервисов** указать URL страницы своего клиентского приложения 
с параметром **from_yandex_auth**, чтобы клиентское приложение могло отследить возврат с авторизации Яндекса. 
Например, если приложение выложено в Яндекс Object Storage, 
то URL будет выглядеть примерно так - **https://имя_бакета.website.yandexcloud.net/?from_yandex_auth=1**.

Для минимальной функциональности в нашей БД необходимы следующие таблицы:

```sql
    CREATE TABLE users (
        key Utf8 NOT NULL,
        ref Utf8,
        name Utf8,
        data JsonDocument,
        developer Bool,
        PRIMARY KEY (key),
        INDEX idx_ref GLOBAL ON (ref)
    );
```

```sql
    CREATE TABLE sessions (
        ref Utf8 NOT NULL,
        user Utf8,
        yandex_token Utf8,
        PRIMARY KEY (ref),
        INDEX idx_user GLOBAL ON (user)
    );
```

Установка модуля:

> **npm install 'https://gitpkg.now.sh/poptlt/alto-fw/server/yandex_oauth2?master'**

Подключаем:

```javascript
    const auth = require('@alto-fw/yandex-oauth2')
    const { invito } = auth({app, ydb, auth: {client_id, clientSecret, authUrl}, ref_key})
```

, где параметры:

| параметр | описание |
|----------|----------|
| app | ссылка на [серверное приложение]({% link server/app.md %}) |
| ydb | ссылка на [драйвер YDB]({% link server/ydb.md %}) для работы модуля с БД |
| client_id | ClientID - идентификатор зарегистрированного приложения Яндекс |
| clientSecret | Client secret - секретный ключ зарегистрированного приложения Яндекс |
| authUrl | https://oauth.yandex.ru/authorize - URL авторизации OAUT2 Яндекс |
| ref_key | ссылка на объект модуля [ключей ссылок]({% link server/ref_key.md %}), если эта функциональность используется |

Если мы собираемся пользоваться функциональностью [ссылок-приглашений](#Ссылки-приглашения), то сохраняем ключ **invito** возвращаемого объекта.

В результате у серверного приложения появляется метод **auth** со следующими функциями:

| функция | описание |
|---------|----------|
| yandex_oauth2_url | |
| yandex_oauth2_login | |
| logout | |
| is_authorised | |
| is_developer | |
| current_user | |
| apply_invito | |
| user_nick | |


## Ссылки-приглашения