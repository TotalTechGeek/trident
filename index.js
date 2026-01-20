#!/usr/bin/env node
import { execSync } from 'child_process'
import { load, loadAll, dump } from 'js-yaml'
import fs from 'fs'
import Ajv from 'ajv'
import { prettify } from 'awesome-ajv-errors'
import { parseArgs } from 'util'
import querystring from 'querystring'
import { mkdir, writeFile, copyFile, rm } from 'fs/promises'
import path from 'path'
import { glob, globSync } from 'tinyglobby'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'
import { Handlebars } from 'handlebars-jle'
import { createHash } from 'crypto'

const hbs = new Handlebars()

let { input, values, valueFile, dry, 'enable-exec': enableExec } = parseArgs({
    options: {
        input: { type: 'string', short: 'i', multiple: true },
        values: { type: 'string', short: 'v', multiple: true },
        valueFile: { type: 'string', short: 'f', multiple: true },
        dry: { type: 'boolean' },
        'enable-exec': { type: 'boolean' }
    }
}).values
values = [...(values || [])].map(value => querystring.parse(value)).reduce((acc, value) => ({ ...acc, ...value }), {})

for (let file of valueFile || []) {
    let varName = file
    if (file.includes('=')) [varName, file] = file.split('=')
    else varName = path.basename(file, path.extname(file))
    const content = loadAll(fs.readFileSync(file, 'utf8'))
    values[varName] = content.reduce((acc, value) => ({ ...acc, ...value }), {})
}

if (!input) throw new Error('No input file specified')

const ajv = new Ajv({ useDefaults: true, allErrors: true })

if (enableExec) hbs.engine.addMethod('exec', (args) => {
    if (!enableExec) throw new Error('Execution not enabled')
    return execSync(args.join(' ')).toString().trim()
})

function cleanup (substitution) {
    const root = substitution.$root
    for (const key of Object.keys(substitution)) if (key.startsWith('$')) delete substitution[key]
    return mergeDeep(substitution, root)
}

// Replace the escaping mechanism for this use-case.
// Since we're outputting to YAML,
// We mainly just need to escape objects and arrays.
hbs.engine.addMethod('escape', (item) => {
    if (!item) return item
    if (typeof item === 'object') return JSON.stringify(item)
    return item
}, { optimizeUnary: true, deterministic: true })

hbs.engine.addMethod('import', (args, ctx) => {
    const root = ctx, manifest = root.$values.$template
    let res = load(args[0])

    for (const item of res.$values) {
        for (const key in item) {
            if (!root.$values[key] && key !== '.') root.$values[key] = {}
            const choice = key === '.' ? root.$values : root.$values[key]
            if (typeof item[key] === 'object') Object.assign(choice, item[key])
            else if (fs.existsSync(resolvePath(item[key], manifest))) Object.assign(choice, load(fs.readFileSync(resolvePath(item[key], manifest), 'utf8')))
            else console.warn('Warning could not find: ' + item[key] + ', skipping.')
        }
    }
    return ''
}, { useContext: true, sync: true })


hbs.engine.addMethod('indent', ([content, level, char]) => {
    const indent = (char || ' ').repeat(level)
    return content.split('\n').map((line, x) => (x === 0 ? '' : indent) + line).join('\n')
}, { deterministic: true, sync: true })


hbs.engine.addMethod('read_glob', ([pattern, parse], ctx, abv) => {
    const files = globSync(pattern, { cwd: path.dirname(getTemplateLocation(ctx, abv)), absolute: true })
    return files.map(file => {
        const result = {
            name: path.basename(file, path.extname(file)),
            path: file,
            content: fs.readFileSync(file, 'utf8')
        }
        if (parse) result.content = load(result.content)
        return result
    })
})

hbs.engine.addMethod('hash', ([file], ctx, abv) => {
    const hash = createHash('sha256')
    if (dry) return '<dry-run-hash:' + file + '>'
    hash.update(fs.readFileSync(resolvePath(file, getTemplateLocation(ctx, abv))))
    return hash.digest('hex')
})

hbs.engine.addMethod('validate', ([item, schema], ctx, abv) => {
    const validate = ajv.compile(schema)
    if (!validate(item)) throw new Error('Validation failed: ' + getTemplateLocation(ctx, abv) + ' - ' + ctx.name + ', ' + JSON.stringify(validate.errors, null, 2))
    return ''
})

hbs.engine.addMethod('parse', ([item]) => load(item))

// Allows templates to use ls
hbs.engine.addMethod('ls', ([pth, directories = false], ctx, abv) => {
    return globSync(pth, {
        cwd: path.dirname(getTemplateLocation(ctx, abv)),
        onlyDirectories: directories,
        absolute: true
    })
}, { sync: true })

hbs.engine.addMethod('trim', ([str]) => str.trim(), { deterministic: true, sync: true, optimizeUnary: true })
hbs.engine.addMethod('replace', ([str, old, tweaked]) => str.replace(new RegExp(old, 'g'), tweaked), { deterministic: true, sync: true, optimizeUnary: true })
hbs.engine.addMethod('clamp', ([value, min, max]) => Math.min(Math.max(value, min), max), { deterministic: true, sync: true })
hbs.engine.addMethod('read', ([file], ctx, abv) => fs.readFileSync(resolvePath(file, getTemplateLocation(ctx, abv)), 'utf8'), { sync: true })

let count = 0, failed = 0, written = 0

const templateBaseCache = {}, inputCache = {}
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" }), xmlBuilder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@", format: true })

function getFiles (input) {
    if (input.includes(',')) return input.split(',')

    // check if input is a directory
    if (fs.statSync(input).isDirectory() && fs.existsSync(input + '/template.yaml')) {
        const result = [input + '/template.yaml', fs.existsSync(input + '/manifest.yaml') ? input + '/manifest.yaml' : [{}]]
        if (fs.existsSync(input + '/schema.json')) result.push(input + '/schema.json')
        else if (fs.existsSync(input + '/schema.yaml')) result.push(input + '/schema.yaml')
        return result
    }

    return [input, [{}]]
}

/**
 * Simple object check.
 * @param item
 * @returns {boolean}
 */
const isObject = item => item && typeof item === 'object'


  /**
   * Deep merge two objects.
   * @param target
   * @param ...sources
   */
  export function mergeDeep(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
      for (const key in source) {
        if (isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]:  Array.isArray(source[key]) ? [] : {} })
          mergeDeep(target[key], source[key]);
        } else Object.assign(target, { [key]: source[key] });
      }
    }

    return mergeDeep(target, ...sources);
  }

function replace (str, obj) {
    for (const key in obj) str = str.replace(new RegExp(key, 'g'), obj[key])
    return str
}

async function writeFileInt (file, content) {
    written++
    if (dry) return console.log('>> ' + file + '\n' + content)
    const dir = file.split('/').slice(0, -1).join('/')
    if (dir) await mkdir(dir, { recursive: true })
    await writeFile(file, content)
}

async function copyFileInt (file, output) {
    if (dry) return console.log('>> ' + (output ? output + '/' : '') + path.basename(file))
    if (output?.trim() === '.') output = ''
    if (output) await mkdir(output, { recursive: true })
    await copyFile(file, (output ? output + '/' : '') + path.basename(file))
}

/**
 * Gets the template location from context. Simple utility for some of these methods.
 * @param {*} ctx Context from JSON Logic
 * @param {*} above Context from outside the iterator
 */
function getTemplateLocation (ctx, above) {
    const manifest = ctx.$values && ctx.$values.$template
    if (!manifest) for (const item of above) if (item.$values?.$template) return item.$values.$template
    return manifest
}

function resolvePath (file, manifestLocation) {
    // get dir of manifest file
    const manifestDir = path.dirname(manifestLocation)
    return path.resolve(manifestDir, file)
}


async function processTemplate (template, manifest, schema = { type: 'object', properties: { name: { type: 'string' }}, required: ['name'], additionalProperties: true }, { templateLocation = '.', $values = values, additional = null, chdir = '.', parallel = false } = {}) {
    templateLocation = path.resolve(templateLocation)
    chdir = path.resolve(chdir)
    const substituteTemplate = hbs.compile(template), validate = ajv.compile(schema)
    let promises = []

    for (let item of manifest) {
        if (additional) item = Object.assign({}, additional, item)
        count++
        item.$values = structuredClone($values)
        item.$values.$template = templateLocation
        if (!validate(item)) {
            console.error("\x1b[33m" + `Error occurred on "${item?.name ?? '$[' + (count-1) + ']'}"`)
            console.error(prettify(validate, { data: item }))
            failed++
            continue
        }

        const config = loadAll(substituteTemplate(item))

        async function executeSubstitution (substitution) {
            if (!substitution) return
            if (substitution.$mkdir) {
                if (parallel) console.warn('Parallel execution not supported for $mkdir')
                if (typeof substitution.$mkdir === 'string') substitution.$mkdir = [substitution.$mkdir]
                for (const dir of substitution.$mkdir) fs.mkdirSync(resolvePath(dir, templateLocation), { recursive: true })
            }

            if (substitution.$chdir) {
                if (parallel) console.warn('Parallel execution not supported for $chdir')
                if (!fs.existsSync(resolvePath(substitution.$chdir, templateLocation))) fs.mkdirSync(resolvePath(substitution.$chdir, templateLocation), { recursive: true })
                process.chdir(resolvePath(substitution.$chdir, templateLocation))
            }

            if (substitution.$rm) {
                if (typeof substitution.$rm === 'string') substitution.$rm = [substitution.$rm]
                for (const dir of substitution.$rm) await rm(resolvePath(dir, templateLocation), { recursive: true, force: true })
            }

            if (substitution.$template && substitution.$manifest) {
                const location = resolvePath(substitution.$template, templateLocation), template = readTemplate(location)
                let manifest = substitution.$manifest
                if (typeof manifest === 'string') manifest = [manifest]
                manifest = mergeManifestItems(manifest, templateLocation)
                const schema = substitution.$schema ? load(fs.readFileSync(resolvePath(substitution.$schema, templateLocation), 'utf8')) : undefined
                return processTemplate(template, manifest, schema, { templateLocation: location, $values: item.$values, additional: { ...item, ...cleanup({...substitution}) }, parallel: true })
            }

            if (substitution.$copy) {
                let $copy = substitution.$copy
                if ($copy.files) $copy = $copy.files
                if (typeof $copy === 'string') $copy = $copy.split(',').map(file => file.trim())
                for (const f1 of $copy) for (const f2 of await glob(f1, { cwd: path.dirname(templateLocation) })) await copyFileInt(resolvePath(f2, templateLocation), substitution.$out)
                return
            }

            if (substitution.$exec) {
                if (!enableExec) throw new Error('Execution not enabled')
                return execSync(substitution.$exec)
            }

            if (substitution.$text) {
                if (!substitution.$out) return
                if (typeof substitution.$text === 'object') throw new Error('$text must be a string')
                return writeFileInt(substitution.$out, replace(substitution.$text, substitution.$replace || {}))
            }

            if (substitution.$merge) {
                if (dry) return written++, console.log('>> ' + substitution.$out + ' (would be generated from merge)')
                if (parallel) console.warn('Parallel execution not supported for $merge')
                let $files = substitution.$merge.files
                if (typeof $files === 'string') $files = $files.split(',').map(file => file.trim())
                let merged = ''

                for (const file of $files) {
                    const files = await glob(file, { cwd: path.dirname(templateLocation) })
                    // Note: I could add streaming out support for this
                    for (const file of files) merged += fs.readFileSync(resolvePath(file, templateLocation), 'utf8').toString() + (substitution.$merge.separator ?? '')
                }
                return writeFileInt(substitution.$out, replace(merged, substitution.$replace || {}))
            }

            if (!substitution.$out) return

            const ext = path.extname(substitution.$out).substring(1)
            let loadCommand = path.extname(substitution.$in || '') === '.xml' ? 'load_xml' : 'load'
            substitution.$in = substitution.$in && resolvePath(substitution.$in, templateLocation)

            let output
            if (substitution.$in && !inputCache[substitution.$in]) inputCache[substitution.$in] = load(fs.readFileSync(substitution.$in, 'utf8'))

            if (!substitution.$in) output = cleanup({...substitution})
            else if (loadCommand === 'load_xml') output = mergeDeep(xmlParser.parse(fs.readFileSync(substitution.$in, 'utf8')), cleanup({...substitution}))
            else output = mergeDeep(structuredClone(inputCache[substitution.$in]), cleanup({...substitution}))

            if (ext === 'yaml') output = dump(output)
            if (ext === 'json') output = JSON.stringify(output)
            if (ext === 'xml') output = xmlBuilder.build(output)

            await writeFileInt(substitution.$out, replace(output, substitution.$replace || {}))
        }

        for (const substitution of config) {
            if (parallel) promises.push(executeSubstitution(substitution))
            else await executeSubstitution(substitution)
        }
    }
    await Promise.all(promises)
}

function mergeManifestItems(manifest, templateLocation) {
    // If the item is an object, it'll be treated as a single item
    // If the item is a string, it'll be loaded as a manifest file
    // Then we'll merge the items in the list
    const dict = {}, arr = []

    for (const item of manifest) {
        let items
        if (typeof item === 'string') {
            if (!fs.existsSync(resolvePath(item, templateLocation))) {
                console.warn('Warning could not find: ' + resolvePath(item, templateLocation) + ', skipping.')
                continue
            }
            items = loadAll(fs.readFileSync(resolvePath(item, templateLocation), 'utf8'))
        }
        else items = Array.isArray(item) ? structuredClone(item) : [structuredClone(item)]

        for (const item of items) {
            if (!item.name) throw new Error('Manifest item must have a name')
            if (!dict[item.name]) arr.push(dict[item.name] = item)
            mergeDeep(dict[item.name], item)
        }
    }

    manifest = arr
    return manifest
}

function readTemplate (file) {
  return fs.readFileSync(file, 'utf8').replace(/\$values:.*\n(?:\s+.+\n)*/g, s => `{{#import}}${s}{{/import}}\n`)
}

function parseInput(input) {
    let [template, manifest, schema] = getFiles(input)
    if (typeof manifest === 'object') return processTemplate(readTemplate(template), manifest, { type: 'object' }, { templateLocation: template })
    return processTemplate(readTemplate(template), loadAll(fs.readFileSync(manifest, 'utf8')), schema ? load(fs.readFileSync(schema, 'utf8')) : undefined, { templateLocation: template })
}

let start = Date.now()
for (const file of input) await parseInput(file)
let end = Date.now()

console.log("\x1b[33m" + `Processed ${count} items, ${failed} failed. ${written} files emitted.` + ' Time to emit: ' + (end - start) + 'ms' + "\x1b[0m")

if (failed) process.exit(1)
