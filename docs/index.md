---
title: Введение
layout: default
nav_order: 1
---

Этот типа "фреймворк" родился из "не взлетевшего" по некоторым организационным моментам проекта. 
Проект умер, но, некоторые мысли и решения, в нем использованные, просто было жалко выбрасывать.

Правда результат очень сильно отличается от своего прототипа. 
Исходный проект делался в виде микросервисов на независимых nodejs процессах. 
Которые общались между собой с помощью RabbitMQ. 
В качестве баз данных микросервисов использовался Postgres.
Осталась основная мысль - сделать какой-то достаточно высокоуровневый инструмент для реализации определенного
класса задач. Скажем так учетных.

По ходу дела возникла мысль попытаться уложить все в рамки serverless архитектуры на базе облака Яндекс.
С учетом того, что, на данный момент, это похоже единственная доступная в России площадка такого рода 
с достаточно широким функционалом. 
Естественно, от многих решений пришлось отказаться, много упростить.
Для полного соответствия serverless пришлось очень функциональный Postgres заменить на YDB и т.п.






Модули фреймворка оформлены в виде [монорепозитория на GitHub](https://github.com/poptlt/alto-fw)

На данный момент фреймворк не выложен на NPM, предполагается, что модули можно устанавливать прямо с GitHub с 
помощью сервиса [https://gitpkg.vercel.app/](https://gitpkg.vercel.app/)

Модули [сервера]({% link server.md %})

Модули [клиента]({% link client.md %})

