import { LogicEngine, Compiler } from "json-logic-engine";
import { parse } from './parser.min.mjs'
export const engine = new LogicEngine();

const HashArg = Symbol.for('HashArg');

function each (iterable, func) {
    let res = ''
    if (Array.isArray(iterable)) {
      for (let i = 0; i < iterable.length; i++) res += func(iterable[i], i)
    } else if (typeof iterable === 'object') {
      for (const key in iterable) res += func(iterable[key], key)
    }
    return res
  }
  
  async function eachAsync (iterable, func) {
    let res = ''
    if (Array.isArray(iterable)) {
      for (let i = 0; i < iterable.length; i++) res += await func(iterable[i], i)
    } else if (typeof iterable === 'object') {
      for (const key in iterable) res += await func(iterable[key], key)
    }
    return res
  }
  
  engine.addMethod('each', {
    method: (data, context, above, engine) => {
      const iterable = engine.run(data[0], context, above, engine)
      if (!iterable) return ''
      let res = ''
      res += ''
      if (Array.isArray(iterable)) {
        for (let i = 0; i < iterable.length; i++) {
          res += engine.run(data[1], iterable[i], [{ index: i }, context, ...above], engine)
        }
      } else if (typeof iterable === 'object') {
        for (const key in iterable) {
          res += engine.run(data[1], iterable[key], [{ index: key }, context, ...above], engine)
        }
      }
      return res
    },
    asyncMethod: async (data, context, above, engine) => {
      const iterable = await engine.run(data[0], context, above, engine)
      if (!iterable) return ''
      let res = ''
      res += ''
      if (Array.isArray(iterable)) {
        for (let i = 0; i < iterable.length; i++) {
          res += await engine.run(data[1], iterable[i], [{ index: i }, context, ...above], engine)
        }
      } else if (typeof iterable === 'object') {
        for (const key in iterable) {
          res += await engine.run(data[1], iterable[key], [{ index: key }, context, ...above], engine)
        }
      }
      return res
    },
    compile: (data, buildState) => {
      const { above = [], state, async } = buildState
      let [selector, mapper] = data
      selector = Compiler.buildString(selector, buildState)
      const mapState = {
        ...buildState,
        state: {},
        above: [{ item: selector }, state, ...above],
        avoidInlineAsync: true,
        iteratorCompile: true
      }
      mapper = Compiler.build(mapper, mapState)
      buildState.useContext = buildState.useContext || mapState.useContext
      buildState.methods.push(mapper)
      buildState.methods.each = each
      buildState.methods.eachAsync = eachAsync
      if (async) {
        if (!Constants.isSync(mapper) || selector.includes('await')) {
          buildState.detectAsync = true
          return `await methods.eachAsync(${selector} || [], methods[${
            buildState.methods.length - 1
          }])`
        }
      }
      return `methods.each(${selector} || [], methods[${
        buildState.methods.length - 1
      }])`
    },
    traverse: false,
    deterministic: engine.methods.map.deterministic
  })

engine.methods['lt'] = engine.methods['<'];
engine.methods['lte'] = engine.methods['<='];
engine.methods['gt'] = engine.methods['>'];
engine.methods['gte'] = engine.methods['>='];
engine.methods['eq'] = engine.methods['=='];
engine.methods['ne'] = engine.methods['!='];

engine.methods['multiply'] = engine.methods['*'];
engine.methods['divide'] = engine.methods['/'];
engine.methods['add'] = engine.methods['+'];
engine.methods['subtract'] = engine.methods['-'];

engine.addMethod('log', ([value]) => { console.log(value); return value }, { deterministic: true });
engine.addMethod('max', (args) => Math.max(...args), { deterministic: true });
engine.addMethod('min', (args) => Math.min(...args), { deterministic: true });

engine.addMethod('default', {
    method: (args) => args[0] ?? args[1],
    compile: (args, buildState) => {
        if (!Array.isArray(args)) return false
        let res = Compiler.buildString(args[0], buildState)
        for (let i = 1; i < args.length; i++) res += ' ?? ' + Compiler.buildString(args[i], buildState)
        return '(' + res + ')';
    },
    traverse: true,
    deterministic: true
});

engine.addMethod('lowercase', (args) => args[0].toLowerCase(), { deterministic: true });
engine.addMethod('uppercase', (args) => args[0].toUpperCase(), { deterministic: true });
engine.addMethod('json', (args) => JSON.stringify(args[0]), { deterministic: true });
engine.addMethod('truncate', (args) => args[0].substring(0, args[1]), { deterministic: true });
engine.addMethod('arr', (args) => Array.isArray(args) ? args : [args], { deterministic: true });

engine.addMethod('with', {
    method: (args, context, above, engine) => {
        const [rArgs, options] = processArgs(args)
        const content = rArgs.pop()

        const optionsLength = Object.keys(options).length
        for (const key in options) options[key] = engine.run(options[key], context, { above })
        if (rArgs.length) rArgs[0] = engine.run(rArgs[0], context, { above })

        if (optionsLength && rArgs.length) return engine.run(content, { ...options, ...rArgs[0] }, { above: [null, context, ...above] })
        if (optionsLength) return engine.run(content, options, { above: [null, context, ...above] })
        if (!rArgs.length) return engine.run(content, {}, { above: [null, context, ...above] })

        return engine.run(content, rArgs[0], { above })
    },
    compile: (args, buildState) => {
        const [rArgs, options] = processArgs(args)
        const content = rArgs.pop()

        buildState.methods.push(Compiler.build(content, buildState))
        const position = buildState.methods.length - 1
        const optionsLength = Object.keys(options).length

        let objectBuild = '   '
        for (const key in options) objectBuild += `${Compiler.buildString(key, buildState)}: ${Compiler.buildString(options[key], buildState)}, `
        objectBuild = '{' + objectBuild.slice(0, -2) + '}'

        if (optionsLength && rArgs.length) return `methods[${position}]({ ...(${Compiler.buildString(rArgs[0], buildState)}), ...${objectBuild} })`
        if (optionsLength) return `methods[${position}](${objectBuild})`
        if (!rArgs.length) return `methods[${position}]()`
        return `methods[${position}](${Compiler.buildString(rArgs[0], buildState)})`
    },
    traverse: false,
    deterministic: (data, buildState) => {
        const check = buildState.engine.methods.if.deterministic
        const [rArgs, options] = processArgs(data)
        const content = rArgs.pop()
        return check([Object.values(options), rArgs], buildState) && check(content, { ...buildState, insideIterator: true })
    }
})

engine.addMethod('match', (args) => {
    const value = args[0]
    const [pArgs, options] = processArgs(args.slice(1))
    if (options[value]) return options[value]
    for (let i = 1; i < pArgs.length; i += 2) if (value === pArgs[i]) return pArgs[i+1]
    return pArgs[pArgs.length - 1]
}, { deterministic: true });

engine.addMethod('merge', (args) => Object.assign({}, ...args), { deterministic: true });

engine.addMethod('object', (args) => {
    const [pArgs, obj] = processArgs(args)
    for (let i = 0; i < pArgs.length; i += 2) obj[pArgs[i]] = pArgs[i+1]
    return obj
}, { deterministic: true });

engine.addMethod('indent', ([content, level, char]) => {
    const indent = (char || ' ').repeat(level)
    return content.split('\n').map((line, x) => (x === 0 ? '' : indent) + line).join('\n')
}, { deterministic: true })

engine.addMethod('pickRegex', ([obj, regex]) => {
    const result = {}
    for (const key in obj) if (key.match(new RegExp(regex))) result[key] = obj[key]
    return result
}, { deterministic: true });

engine.addMethod('omitRegex', ([obj, regex]) => {
    const result = {}
    for (const key in obj) if (!key.match(new RegExp(regex))) result[key] = obj[key]
    return result
}, { deterministic: true });

export function processArgs (args) {
    const rArgs = []
    const options = {} 

    for (const arg of args) {
        if (arg && arg.preserve?.[HashArg]) Object.assign(options, arg.preserve);
        else if (arg && arg[HashArg]) Object.assign(options, arg);
        else rArgs.push(arg);
    }

    return [rArgs, options];
}

const preprocessRegex = /(\S.*)\s*\n\s*({{[^{}]*}})\s*\n/g;
export function compile (str) {
    return engine.build(parse(str.replace(preprocessRegex, '$1 $2\n')))
}