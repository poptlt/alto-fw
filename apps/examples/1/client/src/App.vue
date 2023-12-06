<template>
<div>

    <select v-model="url" style="margin: 10px;">
        <option v-for="server in server_list">{{ server }}</option>
    </select>

    <div style="margin: 10px; border: 3px solid">
        <div style="margin: 5px">a: <input type="text" v-model="a"/></div>
        <div style="margin: 5px">b: <input type="text" v-model="b"/></div>
        <div style="margin: 5px">Запрос: {{ req1 }}</div>        
        <button @click="send_req1" type="button" style="margin: 5px">Отправить запрос</button> 
        <div style="margin: 5px">Ответ сервера: {{ res1 }}</div>
    </div>
    
    <div style="margin: 10px; border: 3px solid">
        <div style="margin: 5px">Первый операнд: <input type="text" v-model="o1"/></div>
        <div style="margin: 5px">Второй операнд: <input type="text" v-model="o2"/></div>
        <input type="radio" value="addition" v-model="operation" name="operation"/>Сложение
        <input type="radio" value="subtraction" v-model="operation" name="operation"/>Вычитание
        <input type="radio" value="multiplication" v-model="operation" name="operation"/>Умножение
        <input type="radio" value="division" v-model="operation" name="operation"/>Деление
        <div style="margin: 5px">Запрос: {{ req2 }}</div>        
        <div><button @click="send_req2" type="button" style="margin: 5px">Отправить запрос</button></div>
        <div style="margin: 5px">Ответ сервера: {{ res2 }}</div>
    </div>

</div>
</template>

<script>
import request from '@alto-fw/request'
import config from './config'

export default {

    data() {
        return {
            url: config.urls[0],
            a: null,
            b: null,
            res1: null,
            o1: null,
            o2: null,
            operation: null,
            res2: null
        }
    },
  
    computed: {

        server_list() { return config.urls },

        drv() { return this.url ? request(this.url) : undefined },

        req1() { return {method: 'test', params: [this.a, this.b]}},

        req2() { 

            return {
                method: `arithmetic.${this.operation}`,
                params: [this.o1, this.o2],
            }
        },
    },

    methods: {

        async send_req1() {

            this.res1 = await this.drv(this.req1) 
        },

        async send_req2() {

            this.res2 = await this.drv(this.req2) 
        },
    },
}
</script>

