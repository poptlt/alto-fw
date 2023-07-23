function ref(type, id) { return `${type}_${id.split('-').join('_')}` } 
function new_ref(type) { 
    
    const { v4: uuidv4 } = require('uuid')
    return `${type}_${uuidv4().split('-').join('_')}` 
} 

module.exports = function({app, ydb, auth, ref_key}) {

    const {client_id, clientSecret, authUrl} = auth

    const handlers = {

        yandex_oauth2_url: async function() {
            return `${authUrl}?response_type=code&client_id=${client_id}`
        },

        yandex_oauth2_login: async function(ctx, code) {

            const fetch = require('node-fetch2')

            let answer = await fetch('https://oauth.yandex.ru/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `grant_type=authorization_code&code=${code}&client_id=${client_id}&client_secret=${clientSecret}&device_id=${ctx.session}`
            })

            if (answer.status != 200) throw {code: 'SYSTEM', message: 'что-то не то с запросом токена'}

            let {access_token} = await answer.json()

            answer = await fetch(`https://login.yandex.ru/info?`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `OAuth ${access_token}`
                },
            })

            if (answer.status != 200) throw {code: 'SYSTEM', message: 'что-то не то с запросом данных пользователя'}

            let data = await answer.json()

            let user_ref = await ydb.query(`
                SELECT ref FROM users WHERE key = $key
            `, {key: `yandex_${data.id}`}, 1, 1) 

            user_ref = user_ref ? user_ref : new_ref('user')

            let session_ref = ref('session', ctx.session)

            await ydb.query(`

                $is_developer = (SELECT developer FROM users WHERE key = $key AND developer);
                $void = (SELECT count(*) = 0 FROM (SELECT ref FROM users LIMIT 1) t);
                $to_developer = (SELECT $is_developer OR $void);

                UPSERT INTO users(key, ref, name, data, developer)
                    VALUES ($key, $user_ref, $user_name, CAST($data AS JsonDocument), $to_developer);

                UPSERT INTO sessions(ref, user, yandex_token)
                    VALUES ($session_ref, $user_ref, $yandex_token);

            `, {
                key: `yandex_${data.id}`, 
                user_ref, 
                user_name: data.real_name, 
                data, 
                session_ref,
                yandex_token: access_token,
            })
/*
            let invitos = await ydb.query(`

                SELECT invito FROM user_invitos
                    WHERE object = $session_ref AND NOT deleted
            `, {session_ref})

            let messages = await Promise.all(invitos.map(async item => app.env.invito.apply(ctx, item.invito)))
            messages = messages.filter(item => item != undefined)
            return messages
*/
        },

        is_authorised: async function(ctx) {

            if (!ctx.session) return false

            if (ctx.is_authorised) return ctx.is_authorised

            ctx.is_authorised = !!(await ydb.query(`
                SELECT user FROM sessions WHERE ref = $session;
            `, {session: ref('session', ctx.session)}, 1, 1))

            return ctx.is_authorised
        },
        
        is_developer: async function(ctx) {

            if (!ctx.session) return false

            if (ctx.is_developer) return ctx.is_developer

            ctx.is_developer = await ydb.query(`

                SELECT developer 
                    FROM sessions 
                    JOIN users ON (users.ref = sessions.user)
                    WHERE sessions.ref = $session;
            `, {session: ref('session', ctx.session)}, 1, 1)

            return ctx.is_developer
        }, 
        
        current_user: async function(ctx) {

            if (!ctx.session) return undefined

            if (ctx.current_user) return ctx.current_user

            ctx.current_user = await ydb.query(`

                SELECT users.ref AS ref 
                    FROM sessions 
                    JOIN users ON (users.ref = sessions.user)
                    WHERE sessions.ref = $session;
            `, {session: ref('session', ctx.session)}, 1, 1)

            return ctx.current_user
        },
        
        user_nick: async function (ctx, {user, name}) {

            let for_user = await handlers.current_user(ctx)

            if (!for_user) throw {code: 'SYSTEM', message: 'должен быть определен текущий пользователь'}

            await ydb.query(`
                UPSERT INTO user_nick(user, for_user, name)
                    VALUES($user, $for_user, $name)
            `, {user, for_user, name})
        }
    }

    app.add('auth', async function(ctx) {

        let method = ctx.method
        ctx.method = undefined
        let handler = handlers[method]
        if (!handler) throw {code: 'SYSTEM', message: `У модуля auth нет функции ${method}`}

        return handler(...arguments)
    })

    ref_key.table('user', 'users')

    ref_key.key('user', 'name', `
        SELECT u.ref AS ref, COALESCE(un.name, u.name) AS name
            FROM users u LEFT JOIN user_nick un ON (un.user = u.ref)
            WHERE u.ref IN $refs AND un.for_user = $user
    `)

    const invito_types = {}
    
    const invito = {

        type: function(type, data) {

            if (invito_types[type]) throw new Error(`Тип приглашения ${type} уже существует`)
            else invito_types[type] = data
        },

        get: async function(ctx, type, data) {

            const ref = new_ref('invito')
            const user = await app.auth.current_user(ctx)

            if (!invito_types[type]) throw {code: 'SYSTEM', message: `Не определен тип приглашения ${type}`}

            await ydb.query(`
                INSERT INTO invitos(ref, type, user, date, data)
                    VALUES ($ref, $type, $user, CurrentUtcDatetime(), CAST($data AS JsonDocument))
            `, {ref, type, user, data})

            return ref            
        },

        apply: async function(ctx, invito) {

            ctx.external = false

            let session = ref('session', ctx.session)
            let user  = await app.auth.current_user(ctx)
            let connect = await ydb()

            if (!user) await connect.executeDataQuery(`
    
                DECLARE $session AS Utf8;
                DECLARE $invito AS Utf8;

                UPSERT INTO user_invitos(object, invito, deleted)
                    VALUES ($session, $invito, FALSE)
            `, {$session: session, $invito: invito})  

            else {

                let [res] = await connect.executeDataQuery(`
    
                    DECLARE $user AS Utf8;
                    DECLARE $invito AS Utf8;
        
                    SELECT object FROM user_invitos
                        WHERE object = $user AND invito = $invito AND NOT deleted
                `, {$user: user, $invito: invito})  

                if (res.length) return undefined
        
                let [invito_data] = await connect.executeDataQuery(`
                    DECLARE $invito AS Utf8;
                    SELECT * FROM invitos WHERE ref = $invito;
                `, {$invito: invito})                 

                if (invito_data.length != 1) throw {code: 'SYSTEM', message: 'Что-то не то со ссылкой приглашения'}

                invito_data = invito_data[0]

                const type = invito_data.type
                const date = new Date(invito_data.date)
                const data = JSON.parse(invito_data.data)
                const handler = invito_types[type].handler

                let interval = new Date() - date

                let expire_interval = invito_types[type].expire ? invito_types[type].expire : 7
                expire_interval = expire_interval * 1000 * 60 * 60 * 24

                if (interval > expire_interval) return 'Срок действия приглашения истек!' 

                if (!invito_types[type].multi) {

                    let [users] = await connect.executeDataQuery(`
                        DECLARE $user AS Utf8;
                        DECLARE $invito AS Utf8;

                        SELECT object FROM user_invitos VIEW idx_invito
                            WHERE invito = $invito AND object <> $user AND object LIKE 'user_%' AND NOT deleted;
                    `, {$user: user, $invito: invito}) 
                    
                    if (users.length) return 'Приглашение уже использованно другим пользователем!'                    
                }

                if (typeof handler == 'function') handler = handler(ctx, user, data)

                await connect.executeDataQuery(`

                    DECLARE $session AS Utf8;
                    DECLARE $invito AS Utf8;
                    DECLARE $user AS Utf8;
                    DECLARE $data_str AS Utf8;

                    $data = CAST($data_str AS JsonDocument);

                    ${handler};

                    UPSERT INTO user_invitos(object, invito, deleted)
                        SELECT object, invito, TRUE AS deleted 
                            FROM user_invitos 
                            WHERE object = $session AND invito = $invito
                        UNION ALL
                        SELECT $user AS object, $invito AS invito, FALSE AS deleted
                `, {$session: session, $invito: invito, $user: user, $data_str: JSON.stringify(data)})

                let success = invito_types[type].success

                return success ? await success(ctx, data) : 'Приглашение успешно исполнено!'
            }
        }
    }

    return {invito}
}