---
layout: default
title: request
parent: Клиент
nav_order: 1
---

Модуль для выполнения запросов к [серверному приложению]({% link server/app.md %}) из браузера.

Установка:

> **npm install 'https://gitpkg.now.sh/poptlt/alto-fw/client/request?master'**

Подключение:

```javascript
    import request from '@alto-fw/request'

    const req = request(url)
```

, где **url** это URL доступа к серверному приложению. Например, если приложение оформлено в виде [serverless функции
в облаке Яндекса]({% link server/yc_func.md %}), это "ссылка для вызова".

В **req** мы имеем функцию, с помощью которой можно сделать запрос к приложению.

> **let res = await req({method: 'sum', params = [1, 2], file: undefined, timeout: undefined})**

**timeout** по умолчанию 10 сек.

С помощью параметра **file** можно сохранить **File** или **Blob** в объектном хранилище облака Яндекс. 
В приложении в этом случае используется модуль [S3]({% link server/s3.md %})

В случае положительного результата в переменной **res** будет объект с ключом **result** и собственно результатом 
выполнения функции в его значении. При любой ошибке объект будет содержать ключ **error** и его значением будет
объект ошибки.

