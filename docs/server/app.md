---
layout: default
title: app
parent: Сервер
nav_order: 1
---

С помощью модуля **app** собственно организуется серверное приложение. Объявляются обработчики вызовов и т.д. 

Установка:

> npm install 'https://gitpkg.now.sh/poptlt/alto-fw/server/app?master'

Подключаем модуль:

**const app = require('@alto-fw/app')**

Объявляем вызов **sum**:
```
app.add('sum', async function(ctx, a, b) {

    return a + b
})
```

Первым аргументом любого вызова идет объект контекста, в котором обычно содержится сессия, текущая транзакция и т.д.

Вызываем метод **sum** внутри серверного приложения:

**app.sum(ctx, 1, 2)**

```
app.add('auth', async function(ctx) {

    let method = ctx.method
    ctx.method = undefined
    let handler = handlers[method]
    if (!handler) throw {code: 'SYSTEM', message: `У модуля auth нет функции ${method}`}

    return handler(...arguments)
})
```