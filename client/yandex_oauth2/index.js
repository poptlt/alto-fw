import request from '@alto-fw/request'

export default {

    install: (Vue, {url, authorization, on_message, on_error, handler, auth_handler}) => {

        const req = request(url)

        let params = {}

        const auth = {

            state: null,

            async login() {

                let res = await req({method: 'auth.yandex_oauth2_url'})

                if (res.error) {

                    on_error(`Ошибка при авторизации (${res.error.message})`)
                    throw res.error
                }

                else {

                    localStorage.url_params = JSON.stringify(params)
                    window.location = res.result        
                }        
            },

            async logout() {

                let res = await req({method: 'auth.logout', params: []})
                if (res.error) {

                    on_error(`Ошибка при авторизации (${res.error.message})`)
                    throw res.error
                }
                else window.location.reload()
            }
        }

        const invito_exec = async () => {

            if (auth.state == 'is_authorized' && params.invito) {

                let res = await req({method: 'auth.apply_invito', params: [params.invito]})

                if (res.error) {

                    on_error(`Не удалось исполнить приглашение (${res.error.message})`)
                    throw res.error
                }

                else {

                    if (res.result) on_message(res.result)
                    delete params.invito
                }
            }
        }

        Vue.mixin({

            async created() {

                if (!this.$parent) {

                    let url = new URL(window.location.href)

                    params = Object.fromEntries(url.searchParams)

                    Object.keys(params).forEach(key => url.searchParams.delete(key))
                    
                    window.history.replaceState(null, null, url)       

                    if (params.from_yandex_auth) {

                        auth.state = 'authorization'

                        let res = await req({method: 'auth.yandex_oauth2_login', params: [params.code]})

                        if (res.error) {

                            on_error(`Ошибка при авторизации (${res.error.message})`)
                            throw res.error
                        }

                        else {

                            if (localStorage.url_params) params = JSON.parse(localStorage.url_params)

                            await invito_exec()

                            auth.state = 'is_authorized'
                            if (authorization) authorization()
                        }

                    }

                    if (!auth.state) {

                        let res = await req({method: 'auth.is_authorised'})

                        if (res.error) {

                            on_error(`Ошибка при авторизации (${res.error.message})`)
                            throw res.error
                        }

                        else {

                            if (res.result) {

                                await invito_exec()
                                auth.state = 'is_authorized'
                                if (authorization) authorization()
                            }

                            else auth.state = 'not_authorized'
                        }
                    }

                    await invito_exec()

                    Object.keys(params).forEach(key => {

                        let func 

                        if (auth.state == 'is_authorized' && auth_handler) func = auth_handler[key]
                        if (auth.state == 'not_authorized' && handler) func = handler[key]

                        if (func) func.call(this, params[key]) 
                    })
                }
            },

            data() {

                return {
                    auth,
                }
            },
        })
    }
}
