export default class ToyVue {
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
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim().match(/^{{([\s\S]+)}}$/)) {
        let name = RegExp.$1.trim()
        effect(() => node.textContent = this.data[name])
      }
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      let attributes = node.attributes
      for (let attribute of attributes) {
        // v-model
        if (attribute.name === 'v-model') {
          // 得到 v-model 所绑定的变量
          let name = attribute.value
          // 把变量绑定到 node.value 上
          effect(() => node.value = this.data[name])
          // 监听 input
          node.addEventListener('input', event => this.data[name] = node.value)
        }
        // v-bind
        if (attribute.name.match(/^v\-bind:([\s\S]+)$/)) {
          let attrName = RegExp.$1
          let name = attribute.value
          effect(() => node.setAttribute(attrName, this.data[name]))
        }
        // v-on
        if (attribute.name.match(/^v\-on:([\s\S]+)$/)) {
          let eventName = RegExp.$1
          let funcName = attribute.value
          node.addEventListener(eventName, this[funcName])
        }
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
        if (!effects.has(object))
             effects.set(object, new Map)
        if (!effects.get(object).has(property))
             effects.get(object).set(property, new Array)
        effects.get(object).get(property).push(currentEffect)
      }
      return object[property]
    },
    set(object, property, value) {
      object[property] = value
      if (effects.has(object) && effects.get(object).has(property)) {
        for (let effect of effects.get(object).get(property)) {
          effect()
        }
      }
      return true
    } 
  })
  return observed
}

// let dummy
// const counter = reactive({ num: 0 })
// effect(() => (dummy = counter.num))

// let dummy2
// const counter2 = reactive({ num: 0 })
// effect(() => (dummy2 = counter2.num))

// counter.num = 7

// 只要一改 counter.num 就会 alert
// 如果改其他的比如 counter.num2 就不会发生监听
// effect 实际上就是一个监听
// const counter = reactive({ num: 0 })
// effect(() => alert(counter.num))
// window.counter = counter