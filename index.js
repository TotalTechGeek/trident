#!/usr/bin/env node
import { execSync } from 'child_process'
import { load, loadAll, dump } from 'js-yaml'
import fs from 'fs'
import Handlebars from 'handlebars'
import Ajv from 'ajv'
import { prettify } from 'awesome-ajv-errors'
import { parseArgs } from 'util'
import querystring from 'querystring'
import { mkdir, writeFile, copyFile } from 'fs/promises'
import path from 'path'
import { globSync } from 'glob'
import archiver from 'archiver'
import helpers from 'handlebars-helpers'

// This is a workaround to allow the $values to be shared between the import and derived templates
const ATTACHED = Symbol('attached')

let { input, values, valueFile, archive, enableTemplateBase, dry, allowValuesSharing, relativeToManifest, relativeToTemplate, relative, base } = parseArgs({
    options: {
        input: { type: 'string', short: 'i', multiple: true },
        values: { type: 'string', short: 'v', multiple: true },
        valueFile: { type: 'string', short: 'f', multiple: true },
        archive: { type: 'string', short: 'a' },
        enableTemplateBase: { type: 'boolean' },
        dry: { type: 'boolean' },
        allowValuesSharing: { type: 'boolean' },
        relativeToManifest: { type: 'boolean' },
        relativeToTemplate: { type: 'boolean' },
        relative: { type: 'boolean' },
        base: { type: 'boolean' }
    }
}).values
relative = relative || relativeToManifest || relativeToTemplate
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
helpers({ handlebars: Handlebars })
Handlebars.registerHelper('min', (...args) => Math.min(...args.slice(0, -1)))
Handlebars.registerHelper('max', (...args) => Math.max(...args.slice(0, -1)))
Handlebars.registerHelper('json', ctx => JSON.stringify(ctx))
Handlebars.registerHelper('merge', (a, b) => ({ ...a, ...b }))
Handlebars.registerHelper('default', (a, b) => a ?? b)
Handlebars.registerHelper('object', (...args) => {
    const obj = {}
    for (let i = 0; i < args.length; i += 2) obj[args[i]] = args[i+1]
    return obj
})
Handlebars.registerHelper('pickRegex', (obj, regex) => {
    const result = {}
    for (const key in obj) if (key.match(new RegExp(regex))) result[key] = obj[key]
    return result
})
Handlebars.registerHelper('omitRegex', (obj, regex) => {
    const result = {}
    for (const key in obj) if (!key.match(new RegExp(regex))) result[key] = obj[key]
    return result
})
Handlebars.registerHelper('or', (...args) => args.slice(0, -1).find(arg => arg))
Handlebars.registerHelper('import', (options) => {
    if (!options.data.original) options.data.original = options.data.root.$values
    options.data.root.$values[ATTACHED] = structuredClone(options.data.original)
    options.data.root.$values = options.data.root.$values[ATTACHED]
    const manifest = options.data.root.$values.$manifest
    let res = load(options.fn(options.data.root))
    for (const item of res.$values) {
        for (const key in item) {
            if (!options.data.root.$values) options.data.root.$values = {}
            if (!options.data.root.$values[key] && key !== '.') options.data.root.$values[key] = {}
            const choice = key === '.' ? options.data.root.$values : options.data.root.$values[key]
            if (typeof item[key] === 'object') Object.assign(choice, item[key])
            else if (fs.existsSync(resolvePath(item[key], manifest))) Object.assign(choice, load(fs.readFileSync(resolvePath(item[key], manifest), 'utf8')))
            else console.warn('Warning could not find: ' + item[key] + ', skipping.')
        }
    }
    return ''
})
Handlebars.registerHelper('cleanImports', (options) => {
    if (!allowValuesSharing && options.data.original) options.data.root.$values = options.data.original
    return ''
})

function cleanup (substitution) {
    for (const key of Object.keys(substitution)) if (key.startsWith('$')) delete substitution[key]
    return substitution
}

let count = 0
let failed = 0
let promises = []

let archiverStream 
const templateBaseCache = {}
const inputCache = {}
const archives = {}

function createArchive (archive) {
    if (!archive) return
    if (archives[archive]) return archives[archive]
    const tarOrZip = path.extname(archive) === '.zip' ? 'zip' : 'tar'
    const compressedTar = archive.endsWith('.gz') || archive.endsWith('.tgz')
    const archiverStream = archiver(tarOrZip, { zlib: { level: 7 }, gzip: compressedTar })
    archiverStream.pipe(fs.createWriteStream(archive))
    archives[archive] = archiverStream
    return archiverStream
}

function getFiles (input) {
    if (input.includes(',')) return input.split(',')
    
    // check if input is a directory
    if (fs.statSync(input).isDirectory() && fs.existsSync(input + '/template.yaml')) {
        const result = [input + '/template.yaml']
        if (fs.existsSync(input + '/manifest.yaml')) result.push(input + '/manifest.yaml')
        else result.push(null)
        if (fs.existsSync(input + '/schema.json')) result.push(input + '/schema.json')
        return result
    }

    throw new Error('Cannot determine manifest and template files')
}

/**
 * Simple object check.
 * @param item
 * @returns {boolean}
 */
export function isObject(item) {
    return (item && typeof item === 'object') || Array.isArray(item);
  }
  
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
          if (!target[key]) {
            if (Array.isArray(source[key])) Object.assign(target, { [key]: [] });
            else Object.assign(target, { [key]: {} });
        }
          mergeDeep(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }
  
    return mergeDeep(target, ...sources);
  }

function replace (str, obj) {
    for (const key in obj) str = str.replace(new RegExp(key, 'g'), obj[key])
    return str
}

async function writeFileInt (file, content, archiverStream) {
    if (dry) {
        console.log('>> ' + file)
        console.log(content)
        return
    }

    if (archiverStream) {
        archiverStream.append(content, { name: file })
        return
    }

    await mkdir(file.split('/').slice(0, -1).join('/'), { recursive: true })
    await writeFile(file, content)
}

async function copyFileInt (file, output, archiverStream) {
    if (dry) {
        console.log('>> ' + (output ? output + '/' : '') + path.basename(file))
        return
    }

    if (output?.trim() === '.') output = ''
    if (archiverStream) {
        archiverStream.file(file, { name: (output ? output + '/' : '') + path.basename(file) })
        return
    }

    if (output) await mkdir(output, { recursive: true })
    await copyFile(file, (output ? output + '/' : '') + path.basename(file))
}

function resolvePath (file, manifestLocation) {
    if (relative) {
        // get dir of manifest file
        const manifestDir = path.dirname(manifestLocation)
        return path.resolve(manifestDir, file)
    }
    return file
}


function process (template, manifest, schema = { type: 'object', properties: { name: { type: 'string' }}, required: ['name'], additionalProperties: true }, {
    templateLocation = '.',
    $values = values,
    additional = null,
    archiverStream = null
} = {}) {
    const substituteTemplate = Handlebars.compile(template, { noEscape: true })
    
    const validate = ajv.compile(schema)


    for (let item of manifest) {
        count++
        if (additional) item = Object.assign({}, additional, item)
        item.$values = $values
        item.$values.$manifest = templateLocation
        if (!validate(item)) {
            console.error("\x1b[33m" + `Error occurred on "${item?.name ?? '$[' + (count-1) + ']'}"`)
            console.error(prettify(validate, { data: item }))
            failed++
            continue
        }
        
        const config = loadAll(substituteTemplate(item))
        for (const substitution of config) promises.push((async () => {
            if (!substitution) return

            if (substitution.$template && substitution.$manifest) {
                const location = resolvePath(substitution.$template, templateLocation)
                const template = readTemplate(location)
                let manifest = substitution.$manifest
                if (typeof manifest === 'string') manifest = loadAll(fs.readFileSync(resolvePath(manifest, templateLocation), 'utf8'))
                const schema = substitution.$schema ? JSON.parse(fs.readFileSync(resolvePath(substitution.$schema, templateLocation), 'utf8')) : undefined
                return process(template, manifest, schema, {
                    templateLocation: location,
                    $values: $values[ATTACHED],
                    additional: { ...item, ...cleanup({...substitution}) },
                    archiverStream: substitution.$archive ? createArchive(substitution.$archive) : archiverStream
                })
            }

            if (substitution.$copy) {
                const files = globSync(substitution.$copy.split(',').map(file => file.trim()), {
                    ...(relative && { cwd: path.dirname(templateLocation) })
                })
                for (const file of files) await copyFileInt(resolvePath(file, templateLocation), substitution.$out, archiverStream)
                return
            }
    
            
            if (!substitution.$in) return

            const ext = path.extname(substitution.$out).substring(1)
            let loadCommand = path.extname(substitution.$in) === '.xml' ? 'load_xml' : 'load'

            
            let output 
            if (!enableTemplateBase && !inputCache[substitution.$in]) inputCache[substitution.$in] = load(fs.readFileSync(resolvePath(substitution.$in, templateLocation), 'utf8'))

            if (enableTemplateBase) {
                if (!templateBaseCache[substitution.$in]) {
                    templateBaseCache[substitution.$in] = Handlebars.compile(fs.readFileSync(resolvePath(substitution.$in, templateLocation), 'utf8'), { noEscape: true })
                }

                output = mergeDeep(load(templateBaseCache[substitution.$in](item)), cleanup({...substitution}))                
                if (ext === 'yaml') output = dump(output)
                if (ext === 'json') output = JSON.stringify(output)
                if (ext === 'xml') throw new Error('Not supported')
            }
            else if (loadCommand === 'load_xml') output = execSync(`yq -o=${ext} -n '${loadCommand}("${resolvePath(substitution.$in, templateLocation)}") * ${JSON.stringify(cleanup({...substitution}))}'`).toString()
            else {
                output = mergeDeep(structuredClone(inputCache[substitution.$in]), cleanup({...substitution}))
                if (ext === 'yaml') output = dump(output)
                if (ext === 'json') output = JSON.stringify(output)
                if (ext === 'xml') throw new Error('Not supported')
            }
            await writeFileInt(substitution.$out, replace(output, substitution.$replace || {}), archiverStream)
        })())
    }
}

function readTemplate (file) {
    return '{{cleanupImports}}\n' + 
        fs.readFileSync(file, 'utf8')
        .replace(/\$values:.*\n(?:\s+.+\n)*/g, s => `{{#import}}${s}{{/import}}\n`)
        .replace(/^---/gm, '{{cleanImports}}\n---')
}


function parseInput(input) {
    let [template, manifest, schema] = getFiles(input)

    if (!manifest && !base) throw new Error('No manifest file found')
    if (!manifest && base) manifest = [{ name: 'Base' }]
    
    const schemaDoc = schema ? JSON.parse(fs.readFileSync(schema, 'utf8')) : undefined
    const manifestData = typeof manifest === 'string' ? loadAll(fs.readFileSync(manifest, 'utf8')) : manifest

    return process(readTemplate(template), manifestData, schemaDoc, {
        templateLocation: template,
        archiverStream: createArchive(archive)
    })    
}

let start = Date.now()
for (const file of input) parseInput(file)
let end = Date.now()

await Promise.all(promises)
console.log("\x1b[33m" + `Processed ${count} items, ${failed} failed.` + 
    ' Time to emit: ' + (end - start) + 'ms'
    + "\x1b[0m")

for (const key in archives) archives[key].finalize()