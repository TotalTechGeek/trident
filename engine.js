import { LogicEngine, Compiler } from "json-logic-engine";
import { parse } from './parser.min.mjs'
export const engine = new LogicEngine();

const HashArg = Symbol.for('HashArg');

function mapFn (fn) {
    return Object.keys(this).map((key) => fn({ '@key': key, this: this[key] }))
}

// We haven't added support for "map" on objects in root JSON Logic,
// So this is a workaround to allow for "each" to work on objects.
engine.addMethod('each', {
    traverse: false,
    method: (args, ...all) => {
        args[0] = { '%forceMap': args[0] }
        return engine.methods.map.method(args, ...all);
    },
    compile: (args, buildState) => {
        args[0] = { '%forceMap': args[0] }
        return engine.methods.map.compile(args, buildState); 
    },
    deterministic: engine.methods.map.deterministic,
    useContext: engine.methods.map.useContext
})

engine.addMethod('%forceMap', (item) => {
    if (!item) return [];
    if (Array.isArray(item)) return item;
    Object.defineProperty(item, 'map', { value: mapFn.bind(item), enumerable: false });
    return item;
}, { deterministic: true })

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
    deterministic: true
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