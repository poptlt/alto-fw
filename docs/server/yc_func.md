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
    
    const app = (event, context) => {

        const app = require('@alto-fw/app')

        // ...
        // собственно определяем приложение
        // ...        

        return app
    }

    module.exports.handler = handler({data, app, cors_client})
```





