export default class Vue {
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
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim().match(/^{{([\s\S]+)}}$/)) {
        const name = RegExp.$1.trim()
        effect(() => (node.textContent = this.data[name]))
      }
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const attributes = node.attributes
      for (const attribute of attributes) {
        // v-model
        if (attribute.name === 'v-model') {
          // 得到 v-model 所绑定的变量
          const name = attribute.value
          // 把变量绑定到 node.value 上
          effect(() => (node.value = this.data[name]))
          // 监听 input
          node.addEventListener(
            'input',
            event => (this.data[name] = node.value)
          )
        }
        // v-bind
        if (attribute.name.match(/^v\-bind:([\s\S]+)$/)) {
          const attrName = RegExp.$1
          const name = attribute.value
          effect(() => node.setAttribute(attrName, this.data[name]))
        }
        // v-on
        if (attribute.name.match(/^v\-on:([\s\S]+)$/)) {
          const eventName = RegExp.$1
          const funcName = attribute.value
          node.addEventListener(eventName, this[funcName])
        }
      }
    }
    // 递归调用
    if (node.childNodes && node.childNodes.length) {
      for (const child of node.childNodes) {
        this.traversal(child)
      }
    }
  }
}

const effects = new Map()

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
  const observed = new Proxy(object, {
    // 为了知道 effect 中存的是什么，需要写一个 getter 做依赖收集
    get(object, property) {
      if (currentEffect) {
        if (!effects.has(object)) effects.set(object, new Map())
        if (!effects.get(object).has(property))
          effects.get(object).set(property, new Array())
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
        for (let effect of effects.get(object).get(property)) {
          effect()
        }
      }
      return true
    }
  })
  return observed
}
