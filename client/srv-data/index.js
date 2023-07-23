import stringify from 'json-stable-stringify'
import request from '../request'

function ref_type(ref) { return ref.substring(0, ref.length - 37) }

function get_root(component) { return component.$parent ? get_root(component.$parent) : component }

function data_objects_plus(component) {

    let res = new Set(component.data_objects)

    function add(cur) {

      cur.$children.forEach(component => {
        component.data_objects.forEach(obj => res.add(obj))
        add(component)
      })
    }

    add(component)

    return [...res] 
}

function data_objects_clear(component) {

    let list = data_objects_plus(component)
    list.forEach(obj => {
        if (obj.clear) obj.clear()
    })
}

function data_objects_load(component) {

    let list = data_objects_plus(component)
    
    list.forEach(obj => {
        if (obj.load) obj.load()
    })
}

export default {
    install: (Vue, {name, url}) => {

        const req = request(url)

        let data_cache = Vue.observable({
    
            view: {},
            ref_key: {},
        })

        let root

        let reqs_queue = new Proxy([], {
            get(target, prop) {
                if (prop === 'push') return (obj) => {
                    if (!target.includes(obj)) target.push(obj)
                }
                else return target[prop]
            }
        })    

        async function exec_req() {

            if(reqs_queue.length) {

                let cur = reqs_queue.shift()
                let data_date = new Date()
                cur._date = data_date

                let res = await req({
                    method: cur._method, 
                    params: cur._params, 
                    file: cur._file,
                    timeout: cur._timeout
                })

                cur.loading = false

                if (res.error) {

                    cur.data = undefined
                    cur.error = res.error
                    cur._resolve(undefined)
                }

                else {
                    cur.data = res.result
                    cur._resolve(res.result)

                    if (cur._type == 'action') data_objects_load(root)
                }
            }
        }

        setInterval(exec_req, 50)

        let keys_queue = new Proxy([], {
            get(target, prop) {
                if (prop === 'push') return (obj) => {
                    if (!target.includes(obj)) target.push(obj)
                }
                else return target[prop]
            }
        })  

        async function get_ref_key() {

            if(keys_queue.length) {
               
                let data_date = new Date()
                                
                let qnt = 0

                let for_send = []

                while (keys_queue.length && qnt < 100) {

                    let cur = keys_queue.shift()

                    cur._date = data_date

                    let ref = cur._ref
                    let key = cur._key
              
                    for_send.push({ref, key})

                    qnt++
                }

                let res = await req({method: 'ref_key', params: [for_send]})

                let data = {}

                if (res.error) console.log('ошибка ref_key', res.error)

                else data = res.result
                 
                for_send.forEach(item => {
 
                    let obj = data_cache.ref_key[ref_type(item.ref)][item.ref][item.key]
                    
                    obj.loading = false
                    obj.data = data[item.ref] ? data[item.ref][item.key] : undefined
                    obj._resolve(obj.data)
                })
            }
        }

        setInterval(get_ref_key, 50)

        const proxy_key = {

            get(target, prop) {

                let obj = {...target()}

                if (obj.wait_arg) throw new Error('ожидается вызов функции с аргументом')

                if (obj.type) {

                    if (['query', 'view', 'action'].includes(obj.type)) obj.method.push(prop)

                    else if (obj.type == 'ref') {
                        obj.key = prop
                        obj.wait_arg = 'ref_key'
                    }

                    else throw new Error('так не бывает')
                }
                
                else {

                    if (prop == 'data') {

                        return {

                            list: function() { return data_objects_plus(obj.ctx) },

                            loading: function() {

                                return !!(data_objects_plus(obj.ctx)
                                    .map(item => item.loading)
                                    .filter(item => !!item)
                                    .length)
                            },

                            errors: function() {

                                return data_objects_plus(obj.ctx)
                                    .map(item => item.error)
                                    .filter(item => !!item)
                            },

                            clear: function() { data_objects_clear(obj.ctx) },
                            
                            load: function() { data_objects_load(obj.ctx) },
                        }
                    }

                    else if (prop == 'timeout') obj.wait_arg = 'timeout'

                    else if (prop == 'file') obj.wait_arg = 'file'

                    else if (prop == 'view' ) {
                        obj.type = 'view'
                        obj.wait_arg = 'view'
                        obj.method = []
                    }

                    else if (prop == 'action') {
                        obj.type = 'action'
                        obj.method = []
                    }

                    else if (prop == 'ref') {
                        obj.type = 'ref'
                        obj.wait_arg = 'ref'
                    }

                    else {
                        obj.type = 'query'
                        obj.method = [prop]
                    }
                }

                return new Proxy (function() { return obj }, proxy_key)
            },
            
            apply(target, thisArg, args) {

                let obj = {...target()}

                if (obj.wait_arg) {

                    if (obj.wait_arg == 'timeout') obj.timeout = args[0]
                    else if (obj.wait_arg == 'file') obj.file = args[0]
                    else if (obj.wait_arg == 'view') obj.default = args[0]
                    else if (obj.wait_arg == 'ref') obj.ref = args[0]
                    
                    else if (obj.wait_arg == 'ref_key') {
                        
                        obj.default = args[0]
                    
                        let ref = obj.ref
                        let r_type = ref_type(ref)  
                        let key = obj.key  

                        if (!data_cache.ref_key[r_type]) Vue.set(data_cache.ref_key, r_type, {})
                        if (!data_cache.ref_key[r_type][ref]) Vue.set(data_cache.ref_key[r_type], ref, {})

                        let data_obj = data_cache.ref_key[r_type][ref][key]

                        if (!data_obj) {

                            let _resolve, promise = new Promise((resolve) => {_resolve = resolve})

                            data_obj = {
    
                                _type: 'ref_key',
                                _ref: ref,
                                _key: key,
                                loading: true,
                                _resolve,
                                promise,
                                _default: obj.default,
                                data: obj.default,
                            }

                            Vue.set(data_cache.ref_key[r_type][ref], key, data_obj)

                            data_obj.load = function() {
    
                                let _resolve, promise = new Promise((resolve) => {_resolve = resolve})
                                this._resolve = _resolve
                                this.promise = promise
                                keys_queue.push(data_obj)
                                return promise
                            }
    
                            data_obj.clear = function() {
    
                                let _resolve, promise = new Promise((resolve) => {_resolve = resolve})
                                this.loading = true
                                this.data = this._default
                                this.error = null
                                this._resolve = _resolve
                                this.promise = promise
                                keys_queue.push(data_obj)
                                return promise
                            }
                    
                            keys_queue.push(data_obj)
                        }

                        else {
                            if (obj.default && (stringify(data_obj._default) != stringify(obj.default))) 
                                throw new Error('для одного и того же объекта данных может быть только одно значение по умолчанию до загрузки данных')
                        }

                        if (!obj.ctx.data_objects.includes(data_obj)) obj.ctx.data_objects.push(data_obj)

                        return data_obj      
                    }
                    
                    else throw new Error('так не бывает')
                    obj.wait_arg = undefined
                    return new Proxy (function() { return obj }, proxy_key)
                }

                let data_obj
                let method = obj.method.join('.')
                let params = args

                if (obj.type == 'query') {

                    let _resolve, promise = new Promise((resolve) => {_resolve = resolve})

                    data_obj = {
    
                        _type: 'query',
                        _method: method,
                        _params: params,
                        _file: obj.file,
                        _timeout: obj.timeout,
                        _date: undefined,
                        loading: true,
                        promise,
                        _resolve,
                        data: undefined,
                        error: undefined,
                    }

                    reqs_queue.push(data_obj)
                }

                else if (obj.type == 'view') {

                    if (!data_cache.view[method]) Vue.set(data_cache.view, method, {})

                    data_obj = data_cache.view[method][stringify(params)]

                    if (!data_obj) {

                        let _resolve, promise = new Promise((resolve) => {_resolve = resolve})

                        data_obj = {

                            _type: 'view',
                            _method: method,
                            _params: params,
                            loading: true,
                            _resolve,
                            promise,
                            _default: obj.default,
                            data: obj.default,
                            error: undefined,
                        }
                
                        Vue.set(data_cache.view[method], stringify(params), data_obj)

                        data_obj.load = function() {

                            let _resolve, promise = new Promise((resolve) => {_resolve = resolve})
                            this._resolve = _resolve
                            this.promise = promise
                            reqs_queue.push(data_obj)
                            return promise
                        }

                        data_obj.clear = function() {

                            let _resolve, promise = new Promise((resolve) => {_resolve = resolve})
                            this.loading = true
                            this.data = this._default
                            this.error = undefined
                            this._resolve = _resolve
                            this.promise = promise
                            reqs_queue.push(data_obj)
                            return promise
                        }
                
                        reqs_queue.push(data_obj)
                    }
                    else {
                        if (obj.default && (stringify(data_obj._default) != stringify(obj.default))) 
                            throw new Error('для одного и того же объекта данных может быть только одно значение по умолчанию до загрузки данных')
                    }
                }

                else if (obj.type == 'action') {

                    if (!root) root = get_root(obj.ctx)

                    let _resolve, promise = new Promise((resolve) => {_resolve = resolve})

                    data_obj = {
    
                        _type: 'action',
                        _method: method,
                        _params: params,
                        _file: obj.file,
                        _timeout: obj.timeout,
                        _date: undefined,
                        loading: true,
                        promise,
                        _resolve,
                        data: undefined,
                        error: undefined,
                    }

                    reqs_queue.push(data_obj)
                }

                else throw new Error('так не бывает')

                if (!obj.ctx.data_objects.includes(data_obj)) obj.ctx.data_objects.push(data_obj)

                return data_obj
            }
        }

        function d_obj(ctx) { return new Proxy (function() {return {ctx}}, proxy_key) }

        Vue.mixin({

            beforeCreate() {

                this[name] = d_obj(this)
            },
            
            data() {
                return {
                    data_objects: []
                }
            },
        })
    }
}