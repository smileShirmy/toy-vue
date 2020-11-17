# 双向绑定实现

和 Vue2 不同的是，Vue3 通过 [Proxy](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Proxy) 实现对对象的劫持

- [响应性基础](https://www.vue3js.cn/docs/zh/guide/reactivity-fundamentals.html)
- [响应式计算和侦听](https://www.vue3js.cn/docs/zh/guide/reactivity-computed-watchers.html)

## 最终效果

先看最终效果

<toy-vue-demo />

## Proxy 原理

通过 Proxy 中的 get 方法可以捕捉到对象属性的读取，这样就可以改变读取操作的行为，如下示例：

```javascript
function reactive(object) {
  return new Proxy(object, {
    get(object, property) {
      console.log(object, property)
      return object[property]
    }
  })
}

const object = reactive({ a: 1 })

object.a
// => {a: 1} "a"

object.b
// => {a: 1} "b"
```

在 Vue3 中可以通过 `reactive` 方法给一个对象创建响应式状态

## 基础使用

下面是 Vue 的基础使用，下面的例子取自官方示例

```html
<div id="app">
  {{ message }}
</div>

<script type="module">
  import Vue from './vue.js'

  const app = new Vue({
    el: '#app',
    data: {
      message: 'Hello Vue!'
    }
  })
</script>
```

根据上面的基础示例，我们需要一个 Vue 类找到需要渲染的模板以及获取需要绑定的变量及初始值，如下：

```js
// 收集 template 和 data
export class Vue {
  constructor(config) {
    // 找到需要渲染的 template
    this.template = document.querySelector(config.el)
    // 获取 data
    this.data = config.data
  }
}
```

## 实现 effect

接下来，我们需要对 `config.data` 的数据进行监听

:::tip
Vue3 中有一个 effect 方法立即执行传入的函数，同时响应式追踪其依赖，并在其依赖变更时重新运行该函数
:::

具体使用可以看这个[测试用例 effect](https://github.com/vuejs/vue-next/blob/master/packages/reactivity/__tests__/effect.spec.ts)

下面是其中一个测试用例

```js
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

根据上面的测试用例，在 `counter.num = 7` 时执行了 `dummy = counter.num`，结合 Proxy，我们可以联想到这里改变了了 `{ num: 0 }` 的 `set` 行为，并且在 `effect()` 后就立即给 `dummy` 赋值 `0`，因此我们可以写出下面的代码：

```js
// 存储 effect
const effects = []

function effect(fn) {
  // 把函数放到一个数组中，等后续触发 set() 的时候执行它
  effects.push(fn)
  // 每次对一个函数进行 effect 的时候要执行它，上面的测试用例中执行 effect 后 dummy 就马上赋值为 0
  fn()
}

function reactive(object) {
  const observed = new Proxy(object, {
    // 捕获 set 行为
    set(object, property, value) {
      object[property] = value
      // 当给属性值重新赋值时执行 effect
      for (const effect of effects) {
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
// => 0   立即执行了 effect 的方法

// 触发 dummy = counter.num
counter.num = 7

console.log(dummy)
// => 7
```

需要注意的是，上面的实现是用一个 `effects` 数组来收集函数的，这样每次触发 `set` 的时候都会遍历整个数组执行 `effect`，而且上面并没有传入一个指定的 `property`，这样无论是 `counter.a = 1` 还是 `counter.b = 2` 这样并无对其进行响应式的属性也会触发 `set` 执行 `effect`

这样显然是有问题的，假设有 n 个 `effect`，n 个 `property`，那么执行一遍就会执行 `n * n`，因此需要在第一遍执行的时候做**依赖收集**

## effect 依赖收集

观察 `effect(() => (dummy = counter.num))` 中的 `counter.num`，这里触发了一次 `get`，因此可以通过捕获 `get`，而在 `get` 中可以得到相应的 `object` 和 `property`，这里指的是 `counter` 和 `num`，因此在 `get` 中可以对 `counter` 及 `num` 进行**依赖收集**，如下所示：

这里使用 [Map](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Map) 来收集依赖

```js
const effects = new Map()

// 需要一个全局的 currentEffect 来保存当前的 effect
let currentEffect = null

function effect(fn) {
  currentEffect = fn
  fn() // 执行 fn 会触发 get 进行依赖收集，这里的 fn 即是 dummy = counter.num
  currentEffect = null
}

function reactive(object) {
  const observed = new Proxy(object, {
    get(object, property) {
      if (currentEffect) {
        if (!effects.has(object)) {
          effects.set(object, new Map())
        }
        if (!effects.get(object).has(property)) {
          effects.get(object).set(property, new Array())
        }
        effects
          .get(object)
          .get(property)
          .push(currentEffect)
      }
      return object[property]
    },
    set(object, property, value) {
      object[property] = value
      if (effects.has(object) && effects.get(object).has(property)) {
        for (const effect of effects.get(object).get(property)) {
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

console.log(effects)
```

当前 effects 的结构如下图所示

![effects](@public/toy-vue/effects.png)

第一层以对象作为 `key`，第二层以对象中的属性作为 `key`，并把函数作为数组中的元素，有可能多个 effect 中用到同一个响应式对象及其属性

可以通过下面的示例进行测试

```js
const counter = reactive({ num: 0 })
effect(() => alert(counter.num))
window.counter = counter

// 在控制台中每次修改 counter.num 就会触发 alert
// 如果改其他的比如 counter.num2 就不会发生监听
// effect 实际上就是一个监听
```

:::warning
在业务代码不建议使用 Proxy，因为会改变对象的行为。如果需要直接使用 vue3 的 reactivity 就可以了
:::

## 解析 template

现在，我们已经可以成功监听到对象属性值的变化，现在只需要解析模板并且等值发生变化后渲染上去就可以了

```js
export class Vue {
  constructor(config) {
    this.template = document.querySelector(config.el)
    this.data = reactive(config.data) // 对 data 进行监听

    // 对 template 进行递归解析
    this.traversal(this.template)
  }

  traversal(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      // 匹配模板中渲染的属性
      if (node.textContent.trim().match(/^{{([\s\S]+)}}$/)) {
        const name = RegExp.$1.trim()
        // 对其进行 effect 后会立即执行，{{ message }} 被更改为 Hello Vue!
        effect(() => (node.textContent = this.data[name]))
        // this.data[name] 此后的每一次更改都会触发 node.textContent
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
<!-- 示例 -->
<div id="app">
  {{ message }}
  <input v-model="message" />
</div>

<script type="module">
  import Vue from './vue.js'

  const app = new Vue({
    el: '#app',
    data: {
      message: 'Hello Vue!'
    }
  })
</script>
```

这时需要解析模板中 `v-model` 并取得进行双向绑定得值，这时候只要扩展 `traversal` 即可

```js
traversal(node) {
  // ...
  if (node.nodeType === Node.ELEMENT_NODE) {
    let attributes = node.attributes
    for (let attribute of attributes) {
      if (attribute.name === 'v-model') {
        // 得到 v-model 所绑定的变量
        const name = attribute.value
        // 把变量绑定到 node.value 上，this.data[name] 每次变化都会触发 effect 改变 node.value
        effect(() => node.value = this.data[name])
        // 监听 input，每次触发 input 事件都会触发 this.data[name] 的改变
        node.addEventListener('input', event => this.data[name] = node.value)
      }
    }
  }
  // ...
}
```

## v-bind

```html
<!-- 示例 -->
<div id="app">
  <span v-bind:title="message">
    Hover your mouse over me for a few seconds to see my dynamically bound
    title!
  </span>
</div>

<script type="module">
  import Vue from './vue.js'

  const app = new Vue({
    el: '#app',
    data: {
      message: 'You loaded this page on ' + new Date().toLocaleString()
    }
  })
</script>
```

同样的，解析模板中的 `v-bind`，属性改变时重新设置 `attribute`

```javascript
if (attribute.name.match(/^v\-bind:([\s\S]+)$/)) {
  const attrName = RegExp.$1
  const name = attribute.value
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
  import Vue from './vue.js'

  const app = new Vue({
    el: '#app',
    data: {
      message: 'Hello Vue.js!'
    },
    methods: {
      reverseMessage: function() {
        this.message = this.message
          .split('')
          .reverse()
          .join('')
      }
    }
  })
</script>
```

这里多了 `methods` 属性，因此需要在构造函数中把 `methods` 中的方法都放到实例中，每次触发相应的事件时执行相应的方法

```js
constructor(config) {
  this.template = document.querySelector(config.el)
  this.data = reactive(config.data) // 对 data 进行监听

  for (const name in config.methods) {
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
    const eventName = RegExp.$1
    const funcName = attribute.value
    // 监听事件并执行相应的 method
    node.addEventListener(eventName, this[funcName])
  }
  // ..
}
```
