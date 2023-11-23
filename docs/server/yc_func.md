---
layout: default
title: Yandex Cloud Function
parent: Сервер
nav_order: 4
---

Модуль служит для размещения приложения в облаке Яндекса в виде [функции](https://cloud.yandex.ru/services/functions).

Установка:

> **npm install 'https://gitpkg.now.sh/poptlt/alto-fw/server/yc_func?master'**

Использование:

```javascript
    const handler = require('@alto-fw/yc-func')
    const data = {}
    const cors_client = 'http...'

    const app = (context) => {

        const app = require('@alto-fw/app')

        // ...
        // собственно определяем приложение
        // ...        

        return app
    }

    module.exports.handler = handler({data, app, cors_client})
```
, где параметры обработчика:

**data** - объект, куда обработчик закэширует во время "холодного" старта функции необходимые при "горячем" старте данные (в нашем случае построенное приложение);

**app** - функция, которая при "холодном" старте получит контекст вызова и сформирует приложение. 
В контексте вызова может понадобится, допустим, IAM-токен для подключения к БД YDB;

**cors_client** - URL страницы клиентского приложения. Оно может быть выложенно, например, в том же облаке Яндекса
в сервисе Object Storage и тогда это будет https://имя_вашего_бакета.website.yandexcloud.net/. 
Этот параметр необходим для формирования CORS заголовков в ответе сервера.





