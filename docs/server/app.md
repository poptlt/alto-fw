---
layout: default
title: app
parent: Сервер
nav_order: 1
---

С помощью модуля **app** собственно организуется серверное приложение. Объявляются обработчики вызовов и т.д. 

Установка:

> **npm install 'https://gitpkg.now.sh/poptlt/alto-fw/server/app?master'**

Подключаем модуль:

> **const app = require('@alto-fw/app')**

У объекта **app** есть следующие методы:

# add

Объявляем вызов **sum**:
```javascript
app.add('sum', async function(ctx, a, b) {

    return a + b
})
```

Первым аргументом любого вызова идет объект контекста, в котором обычно содержится сессия, текущая транзакция и т.д.

Вызываем метод **sum** внутри серверного приложения:

> **let sum = app.sum(ctx, 1, 2)**



```javascript
app.add('auth', async function(ctx) {

    let method = ctx.method
    ctx.method = undefined
    let handler = handlers[method]
    if (!handler) throw {code: 'SYSTEM', message: `У модуля auth нет функции ${method}`}

    return handler(...arguments)
})
```

# exists


# ссылки объектов в БД

Для идентификации различных объектов, записываемых в БД используются уникальные ссылки. Что-то типа как в 1С для справочников, документов и т.п.. Ссылка содержит строку-тип и UUID, соответственно гарантирует уникальность.

## new_ref

Для создания новой ссылки какого-либо типа используется метод приложения **new_ref**.

> **let ref = app.new_ref('тип_ссылки')**

## ref_type

Для определения типа ссылки можно воспользоваться методом приложения:

> **let ref_type = app.ref_type(ref)**

# ext

Для внешних вызовов прикладных методов приложения используется метод **ext** (async function(method, params = [], session, file)).
Этот метод используется в модулях 
[HTTP сервер]({% link server/http_server.md %}) 
и [Yandex Cloud Function]({% link server/yc_func.md %}) для обработки запросов, поступивших от клиентского приложения.