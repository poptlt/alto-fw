function new_ref(type) { 
    
    const { v4: uuidv4 } = require('uuid')
    return `${type}_${uuidv4().split('-').join('_')}` 
}

module.exports = function({app, ydb}) {

    return function(type_func, access, handler) {
        
        return async function(ctx, data = {}) {

            const type = typeof type_func == 'string' ? type_func : type_func(data)

            const user = await app.auth.current_user(ctx)
            if (!user) throw {code: 'SYSTEM', message: 'Не определен пользователь действия'}

            const is_developer = await app.auth.is_developer(ctx)

            if (!(is_developer || (access && await access(ctx, {type, data})))) 
                throw {code: 'FOR_USER', message: 'Отсутствует право доступа'}

            const ref = new_ref('action')

            const tsn = await ydb.tsn()

            await tsn.query(`
                INSERT INTO actions(ref, type, user, date, data)
                VALUES(
                    $ref, 
                    $type, 
                    $user, 
                    CurrentUtcDatetime(), 
                    CAST($data AS JsonDocument)
                )
            `, {ref, type, user, data})

            ctx.tsn = tsn
            await handler(ctx, {action: ref, type, data}) 

            await tsn.commit()
            delete ctx.tsn

            return ref
        }
    }
}