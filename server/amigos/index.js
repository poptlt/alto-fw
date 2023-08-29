function ref_type(ref) { return ref.substring(0, ref.length - 37) }

function new_ref(type) { 
    
    const { v4: uuidv4 } = require('uuid')
    return `${type}_${uuidv4().split('-').join('_')}` 
}

function ydb_err_includes(err, str) {

    if (err.message && err.message.includes(str)) return true

    if (err.issues) {

        for (issue of err.issues) {

            let res = ydb_err_includes(issue, str)
            if (res) return true
        }
    }
    
    return false
}


module.exports = function({app, ydb, ref_key, ydb_action, invito}) {

    async function set(ctx, {amigo1, amigo2, action = ''}) {

        const tsn = ctx.tsn ? ctx.tsn : await ydb.tsn()
        
        await tsn.query(`
        
            $act = IF($action = '', NULL, $action);

            UPSERT INTO amigos

                SELECT 
                    t1.user user, 
                    t1.amigo amigo, 
                    COALESCE(a.group, t1.group) group, 
                    COALESCE(a.action, t1.action) action
                    FROM (VALUES($amigo1, $amigo2, $amigo1, $action)) t1(user, amigo, group, action)
                        LEFT JOIN amigos a ON (a.user = t1.user AND a.amigo = t1.amigo)
                UNION ALL
                SELECT 
                    t1.user user, 
                    t1.amigo amigo, 
                    COALESCE(a.group, t1.group) group, 
                    COALESCE(a.action, t1.action) action
                    FROM (VALUES($amigo2, $amigo1, $amigo2, $action)) t1(user, amigo, group, action)
                        LEFT JOIN amigos a ON (a.user = t1.user AND a.amigo = t1.amigo)
        `, {amigo1, amigo2, action})

        if (!ctx.tsn) tsn.commit()
    }

    async function move(ctx, {owner, amigo, to, action = ''}) {

        if (owner == amigo) throw {code: 'SYSTEM', message: 'корень дерева и перемещаемый пользователь не могут совпадать'}

        const tsn = ctx.tsn ? ctx.tsn : await ydb.tsn()

        let qnt = await tsn.query(`
            SELECT COUNT(*) 
                FROM amigos
                    JOIN users u_a ON (u_a.ref = amigos.amigo)
                    JOIN users u_o ON (u_o.ref = amigos.object)
                WHERE object = $owner AND amigo = $amigo AND NOT deleted
        `, {owner, amigo}, 1, 1)

        if (!qnt) throw {code: 'SYSTEM', message: 'между корнем дерева и перемещаемым пользователем должна быть связь'}

        if (owner != to) {

            let qnt = await tsn.query(`
                SELECT COUNT(*)
                    FROM amigos
                    WHERE object = $owner AND amigo = $to AND NOT deleted
            `, {owner, to}, 1, 1)

            if (!qnt) throw {code: 'SYSTEM', message: 'между корнем дерева и узлом, куда идет перемещение, должна быть связь'}
        }

        await tsn.query(`
        
            $new =
                SELECT $to AS object, $amigo AS amigo, NULL AS path
                UNION ALL 
                SELECT object, $amigo AS amigo, IF(path IS NULL, amigo, path || CAST('.' AS Utf8) || amigo) AS path
                    FROM amigos VIEW idx_parent
                    WHERE amigo = $to AND NOT deleted;

            $old_group = SELECT a1.object
                FROM amigos a1
                JOIN amigos a2 ON (a2.amigo = a1.object)
                WHERE a1.amigo = $amigo AND NOT a1.deleted AND a1.path IS NULL 
                AND a2.object = $owner AND NOT a2.deleted;
                
            $old_groups = 
                SELECT COALESCE($old_group, $owner) AS object, $amigo AS amigo
                UNION ALL
                SELECT object, $amigo AS amigo 
                FROM amigos
                WHERE amigo = $old_group AND NOT deleted;  
              
            UPSERT INTO amigos    
            SELECT 
                Unwrap(COALESCE(n.object, o.object)) AS object,
                Unwrap(COALESCE(n.amigo, o.amigo)) AS amigo,
                COALESCE(n.path, NULL) AS path,
                IF(n.object IS NOT NULL, FALSE, TRUE) AS deleted,
                $action AS action
                FROM $new n
                    FULL JOIN $old_groups o ON (o.object = n.object AND o.amigo = n.amigo)    
        `, {owner, amigo, to, action})

        if (!ctx.tsn) tsn.commit()
    }

    async function group_add(ctx, {parent, name, action = ''}) {

        const tsn = ctx.tsn ? ctx.tsn : await ydb.tsn()

        let user = await app.auth.current_user(ctx)
        let ref = new_ref('amigo_group')
        if (!parent) parent = user

        try {

            await tsn.query(`

                $act = IF($action = '', NULL, $action);
                $parent_is_user = IF($parent = $user, TRUE, FALSE);

                DISCARD SELECT Ensure(0, $parent_is_user OR (COUNT(*) = 1), 'error_1')
                    FROM amigo_groups WHERE ref = $parent;

                DISCARD SELECT Ensure(0, $parent_is_user OR (COUNT(*) = 1), 'error_2')
                    FROM amigo_groups
                    WHERE ref = $parent AND user = $user AND deleted IS NULL;

                DISCARD SELECT Ensure(0, COUNT(*) = 0, 'error_3')
                    FROM amigo_groups
                    WHERE ref = $parent AND user = $user AND name = $name AND deleted IS NULL;

                INSERT INTO amigo_groups(ref, user, parent, name, created, saved, deleted)
                    VALUES($ref, $user, $parent, $name, $act, NULL, NULL)
            `, {ref, user, parent, name, action})

            if (!ctx.tsn) tsn.commit()
        }
        catch(err) {

            if (ydb_err_includes(err, 'error_1')) 
                throw {code: 'SYSTEM', message: 'Что-то не то со ссылкой родительской группы'}

            if (ydb_err_includes(err, 'error_2')) 
                throw {code: 'SYSTEM', message: 'Похоже, что группа не принадлежит текущему пользователю или она удалена'}

            if (ydb_err_includes(err, 'error_3')) 
                throw 'Уже существует группа с таким наименованием'
        }
    }

    async function group_del(ctx, {ref, action = ''}) {

        const tsn = ctx.tsn ? ctx.tsn : await ydb.tsn()

        let user = await app.auth.current_user(ctx)

        try {

            await tsn.query(`

                $act = IF($action = '', NULL, $action);

                DISCARD SELECT Ensure(0, COUNT(*) = 1, 'error_1')
                    FROM amigo_groups WHERE ref = $ref;

                DISCARD SELECT Ensure(0, COUNT(*) = 1, 'error_2')
                    FROM amigo_groups
                    WHERE ref = $ref AND user = $user AND deleted IS NULL; 

                DISCARD SELECT Ensure(0, COUNT(*) = 0, 'error_3)
                    FROM (
                        SELECT amigo AS obj
                            FROM amigos VIEW idx_group
                            WHERE group = $ref
                        UNION ALL
                        SELECT ref AS obj
                            FROM amigo_groups VIEW idx_parent
                            WHERE parent = $ref AND deleted IS NULL
                    ) t;

                UPDATE amigo_groups SET deleted = $act
                    WHERE ref = $ref
            `, {ref, user, action})

            if (!ctx.tsn) tsn.commit()
        }
        catch(err) {

            if (ydb_err_includes(err, 'error_1')) 
                throw {code: 'SYSTEM', message: 'Что-то не то со ссылкой родительской группы'}

            if (ydb_err_includes(err, 'error_2')) 
                throw {code: 'SYSTEM', message: 'Похоже, что группа не принадлежит текущему пользователю или она удалена'}

            if (ydb_err_includes(err, 'error_3')) 
                throw 'Удалять можно только пустую группу'
        }

    }

    async function group_rename(ctx, {ref, name, action = ''}) {

        const tsn = ctx.tsn ? ctx.tsn : await ydb.tsn()

        let user = await app.auth.current_user(ctx)

        try {

            await tsn.query(`

                $act = IF($action = '', NULL, $action);
                $parent = SELECT parent FROM amigo_groups WHERE ref = $ref;

                DISCARD SELECT Ensure(0, COUNT(*) = 1, 'error_1')
                    FROM amigo_groups WHERE ref = $ref;

                DISCARD SELECT Ensure(0, COUNT(*) = 1, 'error_2')
                    FROM amigo_groups
                    WHERE ref = $ref AND user = $user AND deleted IS NULL; 

                DISCARD SELECT Ensure(0, COUNT(*) = 0, 'error_3')
                    FROM amigo_groups VIEW idx_parent
                    WHERE parent = $parent AND name = $name AND deleted IS NULL;

                UPDATE amigo_groups SET name = $name
                    WHERE ref = $ref
            `, {ref, user, name, action})

            if (!ctx.tsn) tsn.commit()
        }
        catch(err) {

            if (ydb_err_includes(err, 'error_1')) 
                throw {code: 'SYSTEM', message: 'Что-то не то со ссылкой родительской группы'}

            if (ydb_err_includes(err, 'error_2')) 
                throw {code: 'SYSTEM', message: 'Похоже, что группа не принадлежит текущему пользователю или она удалена'}

            if (ydb_err_includes(err, 'error_3')) 
                throw 'Уже существует группа с таким наименованием'
        }
    }

    if (ref_key) {

        ref_key.table('amigo', 'amigos')
        ref_key.table('amigo_group', 'amigo_groups')

        ref_key.key('user', 'amigos', {
            query: `
                SELECT object AS ref, Unicode::JoinFromList(AGG_LIST(amigo), ",") AS amigos
                    FROM amigos
                    WHERE object IN $refs AND NOT deleted AND path IS NULL
                GROUP BY object;
            `,
            out(data) { return data.split(',') },
            undef: []
        })

        ref_key.key('amigo_group', 'amigos', {
            query: `
                SELECT object AS ref, Unicode::JoinFromList(AGG_LIST(amigo), ",") AS amigos
                    FROM amigos
                    WHERE object IN $refs AND NOT deleted AND path IS NULL
                GROUP BY object;
            `,
            out(data) { return data.split(',') },
            undef: []
        })        

    }

    if (ydb_action) {

        app.add('amigos', async function(ctx, data) {

            const method = ctx.method
            ctx.method = undefined
            ctx.external = false

            if (method == 'group_add') {

                return ydb_action(
                    
                    'amigo_group_add',

                    async function(ctx, {type, data}) { 
                        return await app.auth.current_user(ctx) == await owner(data.parent) 
                    },
                    
                    async function(ctx, {action, type, data}) {

                        await group_add(ctx, {...data, action})
                        return action
                    }
                )(ctx, data)

            }

            else if (method == 'group_del') {

                return ydb_action(
                    
                    'amigo_group_del',

                    async function(ctx, {type, data}) { 
                        return await app.auth.current_user(ctx) == await owner(data.ref) 
                    },
                    
                    async function(ctx, {action, type, data}) {

                        await group_del(ctx, {...data, action})
                        return action
                    }
                )(ctx, data)
            }

            else if (method == 'group_rename') {

                return ydb_action(
                    
                    'amigo_group_rename',

                    async function(ctx, {type, data}) { 
                        return await app.auth.current_user(ctx) == await owner(data.ref) 
                    },
                    
                    async function(ctx, {action, type, data}) {

                        await group_rename(ctx, {...data, action})
                        return action
                    }
                )(ctx, data)
            }

            else if (method == 'move') {

                return ydb_action(
                    
                    'amigo_move',

                    async function(ctx, {type, data}) { 
                        return true 
                    },
                    
                    async function(ctx, {action, type, data}) {

                        let owner = await app.auth.current_user(ctx)

                        await move(ctx, {...data, owner, action})
                        return action
                    }
                )(ctx, data)
            }

            else { throw {code: 'SYSTEM', message: 'нет такого метода у amigos'} }
        })
    }

    if (invito) {



    }

    return {set, move, group_add, group_del, group_rename}
}