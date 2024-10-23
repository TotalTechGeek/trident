import { LogicEngine, Constants } from "json-logic-engine";
import { parse } from './parser.mjs'
export const engine = new LogicEngine();

Object.prototype.map = function (fn) {
    return Object.keys(this).map((key) => fn({ '@key': key, this: this[key] }))
}
Object.defineProperty(Object.prototype, 'map', { enumerable: false });

engine.methods.each = engine.methods.map

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

engine.addMethod('default', (args) => args[0] ?? args[1], { deterministic: true });
engine.addMethod('lowercase', (args) => args[0].toLowerCase(), { deterministic: true });
engine.addMethod('uppercase', (args) => args[0].toUpperCase(), { deterministic: true });
engine.addMethod('json', (args) => JSON.stringify(args[0]), { deterministic: true });
engine.addMethod('truncate', (args) => args[0].substring(0, args[1]), { deterministic: true });

engine.addMethod('match', (args) => {
    const value = args[0]
    for (let i = 1; i < args.length; i += 2) if (value === args[i]) return args[i+1]
    return args[args.length - 1]
}, { deterministic: true });

engine.addMethod('merge', (args) => Object.assign({}, ...args), { deterministic: true });

engine.addMethod('object', (args) => {
    const obj = {}
    for (let i = 0; i < args.length; i += 2) obj[args[i]] = args[i+1]
    return obj
}, { deterministic: true });

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

export function compile (str) {
    return engine.build(parse(str))
}