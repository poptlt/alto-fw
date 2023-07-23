function ref_type(ref) { return ref.substring(0, ref.length - 37) }

function new_ref(type) { 
    
    const { v4: uuidv4 } = require('uuid')
    return `${type}_${uuidv4().split('-').join('_')}` 
}

module.exports = function({app, ydb, ref_key, ydb_action, invito}) {

    async function owner(ref) {

        if (ref_type(ref) = 'user') return ref
        
        else return await ydb.query(`
            SELECT object
                FROM amigos VIEW idx_parent
                WHERE amigo = $ref AND NOT deleted AND object LIKE 'user_%'
        `, {ref}, 1, 1)
    }

    async function set(ctx, {amigo1, amigo2, action = ''}) {

        const tsn = ctx.tsn ? ctx.tsn : await ydb.tsn()
        
        let r = await tsn.query(`

            $act = IF($action = '', NULL, $action);

            $t1 = 
                SELECT ref AS object, $amigo2 AS amigo, $act AS action, FALSE AS deleted, NULL AS path
                    FROM users WHERE ref = $amigo1
                UNION ALL
                SELECT ref AS object, $amigo1 AS amigo, $act AS action, FALSE AS deleted, NULL AS path
                    FROM users WHERE ref = $amigo2;

            $t2 = 
                SELECT object, amigo
                    FROM amigos
                    WHERE NOT deleted 
                        AND ((object = $amigo1 AND amigo = $amigo2) OR (object = $amigo2 AND amigo = $amigo1));

            $t3 =  
                SELECT Unwrap(t1.object) AS object, t1.amigo AS amigo, t1.action AS action, t1.deleted AS deleted, t1.path AS path
                    FROM $t1 t1 LEFT JOIN $t2 t2 ON (t1.object = t2.object AND t1.amigo = t2.amigo) 
                    WHERE t2.object IS NULL;
              
            UPSERT INTO amigos                    
                SELECT * FROM $t3                    
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

    async function del({object, amigo, t_on, action}) {


    }

    async function group_add(ctx, {parent, name, action = ''}) {

        const tsn = ctx.tsn ? ctx.tsn : await ydb.tsn()

        let group_ref = await tsn.query(`
            SELECT amigo_groups.ref
                FROM amigos
                    JOIN amigo_groups ON (amigo_groups.ref = amigos.amigo)
                WHERE object = $parent AND NOT deleted AND path IS NULL AND amigo_groups.name = $name
        `, {parent, name}, 1, 1)

        if (group_ref) throw {code: 'FOR_USER', message: `Уже есть группа с наименованием ${name}`}

        group_ref = new_ref('amigo_group')

        await tsn.query(`
            
            $act = IF($action = '', NULL, $action);

            $rows = 
                SELECT $parent AS object, $group_ref AS amigo, $act AS action, FALSE AS deleted, NULL AS path
                UNION ALL
                SELECT object AS object, $group_ref AS amigo, $act AS action, FALSE AS deleted, 
                    CASE
                        WHEN path IS NULL THEN $parent
                        ELSE path || CAST('.' AS Utf8) || $parent
                    END AS path
                    FROM amigos
                    WHERE amigo = $parent AND amigo LIKE 'amigo_group_%' AND NOT deleted;

            INSERT INTO amigo_groups(ref, name, action)
                VALUES ($group_ref, $name, $act);

            INSERT INTO amigos(object, amigo, action, deleted, path)
                SELECT object, amigo, action, deleted, path FROM $rows                  
        `, {group_ref, name, action, parent})

        if (!ctx.tsn) tsn.commit()
    }

    async function group_del(ctx, {ref, action = ''}) {

        const tsn = ctx.tsn ? ctx.tsn : await ydb.tsn()

        let qnt = await tsn.query(`
            SELECT count(*)
                FROM amigos
                WHERE object = $ref AND NOT deleted
        `, {ref}, 1, 1)

        if (qnt) throw 'нельзя удалять не пустую группу'

        await tsn.query(`

            $act = IF($action = '', NULL, $action);

            UPDATE amigos
                SET deleted = TRUE, action = $act
                WHERE amigo = $ref
        `, {ref, action})

        if (!ctx.tsn) tsn.commit()
    }

    async function group_rename(ctx, {ref, name, action = ''}) {

        const tsn = ctx.tsn ? ctx.tsn : await ydb.tsn()

        let qnt = await tsn.query(`
            $parent = SELECT object FROM amigos WHERE amigo = $ref AND NOT deleted AND path IS NULL;

            SELECT COUNT(*)
                FROM amigos
                    JOIN amigo_groups ON (amigo_groups.ref = amigos.amigo)
                WHERE amigos.object = $parent AND NOT amigos.deleted AND amigos.path IS NULL
                    AND amigo_groups.name = $name
        `, {ref, name}, 1, 1)

        if (qnt) throw `Уже существует группа с наименованием ${name}`

        await tsn.query(`

            $act = IF($action = '', NULL, $action);

            UPDATE amigo_groups 
                SET name = $name, action = $act
                WHERE ref = $ref
        `, {ref, name, action})

        if (!ctx.tsn) tsn.commit()
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

    return {set, move, del, group_add, group_del, group_rename}
}