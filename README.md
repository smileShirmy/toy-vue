## 基础实现

```html
<div id="app">
  {{ message }}
</div>

<script type="module">
  import Vue from './toy-vue.js'
 
  const app = new Vue({
    el: '#app',
    data: {
      message: 'Hello Vue!'
    }
  })
</script>
```

```javascript
// 收集 template 和 data
export class ToyVue {
  constructor(config) {
    this.template = document.querySelector(config.el)
    this.data = config.data
  }
}
```

## Proxy 原理

```javascript
function reactive(object) {
  let observed = new Proxy(object, {
    get(obj, prop) {
      console.log(obj, prop)
      return obj[prop]
    }
  })
  return observed
}

let o2 = reactive({ a: 1 })

o2.c
// => {a: 1} "c"

o2.a
// => {a: 1} "a"
```

## 实现 effect

```javascript
// https://github.com/vuejs/vue-next/blob/master/packages/reactivity/__tests__/effect.spec.ts

// 把 counter.num 赋值给 dummy
// 只要一改 counter.num，dummy 就会随着改变
it('should observe basic properties', () => {
  let dummy
  const counter = reactive({ num: 0 })
  effect(() => (dummy = counter.num))

  expect(dummy).toBe(0)
  counter.num = 7
  expect(dummy).toBe(7)
})
```

```javascript
// 假设有 n 个 effect，n 个 property
// 当执行一遍的时候会执行 n * n 次

// 因此在 effect 执行的第一遍过程中做了依赖收集
// 第一遍执行的时候调用到 effect 中用到的 setter，从而知道哪个 setter 对应哪些 effects
let effects = []

function effect(fn) {
  effects.push(fn)
  fn()
}

function reactive(object) {
  let observed = new Proxy(object, {
    set(object, property, value) {
      object[property] = value
      for (let effect of effects) {
        effect()
      }
      return true
    }
  })
  return observed
}

let dummy

const counter = reactive({ num: 0 })

effect(() => (dummy = counter.num))

console.log(dummy)

counter.num = 7
```

## effect 依赖收集

```javascript
let effects = new Map()

// 因为不知道当前的额 effect 是什么
// 因此需要一个 global 的 currentEffect
let currentEffect = null

function effect(fn) {
  // 获取当前 effect
  currentEffect = fn
  fn() // 执行 fn 会触发依赖收集( 具体逻辑在 reactive 中的 getter )
  // 重置为 null
  currentEffect = null
}

function reactive(object) {
  let observed = new Proxy(object, {
    // 为了知道 effect 中存的是什么，需要写一个 getter 做依赖收集
    get(object, property) {
      if (currentEffect) {
        if (!effects.has(object)) {
          effects.set(object, new Map)
        }
        if (!effects.get(object).has(property)) {
          effects.get(object).set(property, new Array)
        }
        effects.get(object).get(property).push(currentEffect)
      }
      return object[property]
    },
    set(object, property, value) {
      object[property] = value
      if (effect.has(object) && effect.get(object).has(property)) {
        for (let effect of effects.get(object).get(property)) {
          // 结合下面的两个 dummy，effect 只被触发一次，说明成功了
          effect()
        }
      }
      return true
    }
  })
  return observed
}


let dummy
const counter = reactive({ num: 0 })
effect(() => (dummy = counter.num))

let dummy2
const counter2 = reactive({ num: 0 })
effect(() => (dummy2 = counter2.num))

counter.num = 7
```

```javascript
// 只要一改 counter.num 就会 alert
// 如果改其他的比如 counter.num2 就不会发生监听
// effect 实际上就是一个监听
const counter = reactive({ num: 0 })
effect(() => alert(counter.num))
window.counter = counter
```

业务代码不建议使用 Proxy，因为会改变对象的行为。直接使用 reactivity 就可以了

## 解析 template

```javascript
export class ToyVue {
  constructor(config) {
    this.template = document.querySelector(config.el)
    this.data = reactive(config.data) // 对 data 进行监听
    this.traversal(this.template)
  }

  traversal(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim().match(/^{{([\s\S]+)}}$/)) {
        let name = RegExp.$1.trim()
        // 对其进行 effect 后会执行回调，{{ message }} 被更改 Hello Vue!
        // 这是第一个小目标
        effect(() => node.textContent = this.data[name])
      }
    }
    // 递归调用
    if (node.childNodes && node.childNodes.length) {
      for (let child of node.childNodes) {
        this.traversal(child)
      }
    }
  }
}
```

## 双向绑定

```html
<div id="app">
  {{ message }}
  <input v-model="message">
</div>

<script type="module">
  import Vue from './toy-vue.js'
 
  const app = new Vue({
    el: '#app',
    data: {
      message: 'Hello Vue!'
    }
  })
</script>
```

```javascript
traversal(node) {
  // ...
  if (node.nodeType === Node.ELEMENT_NODE) {
    let attributes = node.attributes
    for (let attribute of attributes) {
      if (attribute.name === 'v-model') {
        // 得到 v-model 所绑定的变量
        let name = attribute.value
        // 把变量绑定到 node.value 上
        effect(() => node.value = this.data[name])
        // 监听 input
        node.addEventListener('input', event => this.data[name] = node.value)
      }
    }
  }
  // ...
}
```

## v-bind

```html
<div id="app">
  <span v-bind:title="message">
    Hover your mouse over me for a few seconds
    to see my dynamically bound title!
  </span>
</div>

<script type="module">
  import Vue from './toy-vue.js'
 
  const app = new Vue({
    el: '#app',
    data: {
      message: 'You loaded this page on ' + new Date().toLocaleString()
    }
  })
</script>
```

```javascript
// v-bind
if (attribute.name.match(/^v\-bind:([\s\S]+)$/)) {
  let attrName = RegExp.$1
  let name = attribute.value
  effect(() => node.setAttribute(attrName, this.data[name]))
}
```

## v-on

```html
<div id="app">
  <p>{{ message }}</p>
  <button v-on:click="reverseMessage">Reverse Message</button>
</div>

<script type="module">
  import Vue from './toy-vue.js'
 
  const app = new Vue({
    el: '#app',
    data: {
      message: 'Hello Vue.js!'
    },
    methods: {
      reverseMessage: function () {
        this.message = this.message.split('').reverse().join('')
      }
    }
  })
</script>
```

```javascript
constructor(config) {
  this.template = document.querySelector(config.el)
  this.data = reactive(config.data) // 对 data 进行监听

  for (let name in config.methods) {
    // 把 method 绑定到实例上
    this[name] = () => {
      config.methods[name].apply(this.data)
    }
  }

  this.traversal(this.template)
}

traversal(node) {
  // ...
  // v-on
  if (attribute.name.match(/^v\-on:([\s\S]+)$/)) {
    let eventName = RegExp.$1
    let funcName = attribute.value
    node.addEventListener(eventName, this[funcName])
  }
  // ..
}
```