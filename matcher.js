import { LogicEngine } from "json-logic-engine"

const engine = new LogicEngine()

const regexes = {}
engine.addMethod('~', ([a, b]) => {
    if (!regexes[b]) regexes[b] = new RegExp(b)
    return regexes[b].test(a)
})

engine.addMethod('=', ([a, b]) => (a||'').toString() === (b||'').toString())
engine.addMethod('!=', ([a, b]) => (a||'').toString() !== (b||'').toString())

const ops = /(!=|=|~|<=|>=|>|<)/

export function parseExpressions (expressions) {
    return engine.build({ or: expressions.flatMap(expression => ({ and: expression.split('&').map(exp => {
        const operator = exp.match(ops)[0]
        const [key, value] = exp.split(operator)
        return { [operator]: [{var:key}, value] }
    })}))  })
}
