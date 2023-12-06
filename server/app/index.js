function new_ref(type) { 
    
    const { v4: uuidv4 } = require('uuid')
    return `${type}_${uuidv4().split('-').join('_')}` 
}

function ref_type(ref) { 
        
    if (typeof ref == 'string') {

        if (ref.length < 38) return undefined
        else {
            if (ref.substring(ref.length - 37, ref.length - 36) == '_') return ref.substring(0, ref.length - 37)
            else return undefined
        }
    }
    else return undefined
}

const handlers = {}

const add = {

    get(target, prop) {

        let current = target()

        if (typeof current == 'function') 
            throw new Error(`Нельзя продолжить дерево ключом ${prop}, уткнулись в уже существующий обработчик`)
        
        if (!current[prop]) current[prop] = {}
        
        if (typeof current[prop] == 'function') 
            throw new Error(`Ключ ${prop}, уже является обработчиком`)

        return new Proxy(function() {return current[prop]}, add)
    },

    apply(target, thisArg, args) {

        let current = target()

        if (args.length != 2) throw new Error('Ждем два аргумента: наименование обработчика и собственно функция')
        if (typeof args[0] != 'string') throw new Error('Наименование обработчика должно быть строкой')
        if (typeof args[1] != 'function') throw new Error('Обработчик должен быть функцией')

        if (['add', 'exists', 'new_ref', 'ref_type', 'ext'].includes(args[0]))
            throw new Error(`Нельзя использовать зарезервированные слова (${args[0]}) в качестве наименований функций`)

        if (current[args[0]])
            throw new Error(`Ключ ${args[0]} уже существует`)

        current[args[0]] = args[1]
    }
}

const exists = {

    get(target, prop) {

        let current = target()

        if (typeof current == 'function') 
            throw new Error(`Нельзя продолжить дерево ключом ${prop}, уткнулись в уже существующий обработчик`)

        if (!current[prop]) return false

        if (typeof current[prop] == 'function') 
            throw new Error(`Ключ ${prop}, уже является обработчиком`)
    },

    apply(target, thisArg, args) {

        let current = target()

        if (args.length != 1) throw new Error('Ждем один аргумент: наименование обработчика')
        if (typeof args[0] != 'string') throw new Error('Наименование обработчика должно быть строкой')

        let handler = current[args[0]]
        return (handler && typeof handler == 'function') ? true : false
    }
}

const exec = {

    get(target, prop) {

        let obj = {...target()}

        if (typeof obj.handler == 'function') obj.method.push(prop)

        else {

            if (!obj.handler[prop]) throw new Error(`Ключ ${prop} не существует`)
            else obj.handler = obj.handler[prop]
        }

        return new Proxy(function() {return obj}, exec)       
    },

    apply(target, thisArg, args) {

        let obj = {...target()}

        if (args.length < 1) throw new Error('А где хотя бы один аргумент, контекст?')

        if (obj.method.length > 0) {

            args = [...args]
            args[0].method = obj.method.join('.')
        }

        return obj.handler(...args)
    }
}

const app = new Proxy({}, {

    get(target, prop) {

        if (prop == 'add') return new Proxy(function() {return handlers}, add)

        else if (prop == 'exists') return new Proxy(function() {return handlers}, exists)

        else if (prop == 'new_ref') return new_ref
        else if (prop == 'ref_type') return ref_type

        else if (prop == 'ext') return async function(method, params = [], session, file) {

            if (!Array.isArray(params)) params = [params]

            async function ext_error(ctx, err) {
console.log({ctx, err})
                let is_developer = app.exists('auth') ? await app.auth.is_developer(ctx) : true

                if (is_developer) return err
                else {

                    let data = {...err.error}
                    return {error: {code: data.code, message: data.message}}
                }
            }

            let ctx = {
                file,
                session,
                external: true
            }

            let handler, method_arr, first

            try {
            
                method_arr = method.split('.')
                first = method_arr.shift()

                handler = handlers[first]
            }
            catch(error) {
                return await ext_error(ctx, {code: 'SYSTEM', message: 'Что-то не то с параметрами вызова', origin: {name: error.name, message: error.message}})
            }

            if (!handler) return await ext_error(ctx, {error: {code: 'SYSTEM', message: `Функция ${first} не существует`}})
            
            if (method_arr.length > 0) {
                handler = method_arr.reduce((res, item) => {
                    return res[item]
                }, new Proxy(function() {return {handler, method: []}}, exec))
            }

            try { 
                
                let answer = {result: await handler(ctx, ...params)}
                if (file) answer.put_url = ctx.put_url
                
                return answer 
            }
            
            catch(error) {

                if (typeof error == 'string') {

                    let arr = error.split(':::')
                    if (arr.length == 2) 
                        return await ext_error(ctx, {error: {code: arr[0], message: arr[1]}})
                    else return await ext_error(ctx, {error: {code: 'FOR_USER', message: error}})
                }
                    
                else if (typeof error == 'object') {
                
                    if (error instanceof Error) return await ext_error(ctx, {error: {code: 'SYSTEM', origin: {name: error.name, message: error.message}}})
                    else return await ext_error(ctx, {error})
                }  
                
                else return await ext_error(ctx, {error: {code: 'SYSTEM', origin: error}})
            }
        }

        else {

            let handler = handlers[prop]
            if (!handler) throw new Error(`Ключ ${prop} не существует`)
            return new Proxy(function() {return {handler, method: []}}, exec)
        }
    }
})

module.exports = app