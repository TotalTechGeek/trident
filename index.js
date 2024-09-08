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

let { input, values, valueFile, archive, enableTemplateBase } = parseArgs({
    options: {
        input: { type: 'string', short: 'i', multiple: true },
        values: { type: 'string', short: 'v', multiple: true },
        valueFile: { type: 'string', short: 'f', multiple: true },
        archive: { type: 'string', short: 'a' },
        enableTemplateBase: { type: 'boolean' }
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
    
if (archive) {
    const tarOrZip = path.extname(archive) === '.zip' ? 'zip' : 'tar'
    const compressedTar = archive.endsWith('.gz') || archive.endsWith('.tgz')
    archiverStream = archiver(tarOrZip, { zlib: { level: 7 }, gzip: compressedTar })
    archiverStream.pipe(fs.createWriteStream(archive))
}

function getFiles (input) {
    if (input.includes(',')) return input.split(',')
    
    // check if input is a directory
    if (fs.statSync(input).isDirectory() && fs.existsSync(input + '/manifest.yaml') && fs.existsSync(input + '/template.yaml')) {
        const result = [input + '/template.yaml', input + '/manifest.yaml']
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

async function writeFileInt (file, content) {
    if (archiverStream) {
        archiverStream.append(content, { name: file })
        return
    }

    await mkdir(file.split('/').slice(0, -1).join('/'), { recursive: true })
    await writeFile(file, content)
}

async function copyFileInt (file, output) {
    if (output?.trim() === '.') output = ''
    if (archiverStream) {
        archiverStream.file(file, { name: (output ? output + '/' : '') + path.basename(file) })
        return
    }

    if (output) await mkdir(output, { recursive: true })
    await copyFile(file, (output ? output + '/' : '') + path.basename(file))
}

function parseInput(input) {
    const [template, manifest, schema] = getFiles(input)

    const substituteTemplate = Handlebars.compile(fs.readFileSync(template, 'utf8'), { noEscape: true })
    
    let schemaDoc = { type: 'object', properties: { name: { type: 'string' }}, required: ['name'], additionalProperties: true }
    if (schema) schemaDoc = JSON.parse(fs.readFileSync(schema, 'utf8'))
    const validate = ajv.compile(schemaDoc)
    
    for (const item of loadAll(fs.readFileSync(manifest, 'utf8'))) {
        count++
        item.$values = values
        if (!validate(item)) {
            console.error("\x1b[33m" + `Error occurred on "${item?.name ?? '$[' + (count-1) + ']'}"`)
            console.error(prettify(validate, { data: item }))
            failed++
            continue
        }
        
        const config = loadAll(substituteTemplate(item))
        for (const substitution of config) promises.push((async () => {
            if (!substitution) return
            if (substitution.$copy) {
                const files = globSync(substitution.$copy.split(',').map(file => file.trim()))
                for (const file of files) await copyFileInt(file, substitution.$out)
                return
            }
    
            
            if (!substitution.$in) return

            const ext = path.extname(substitution.$out).substring(1)
            let loadCommand = path.extname(substitution.$in) === '.xml' ? 'load_xml' : 'load'

            
            let output 
            if (!enableTemplateBase && !inputCache[substitution.$in]) inputCache[substitution.$in] = load(fs.readFileSync(substitution.$in, 'utf8'))

            if (enableTemplateBase) {
                if (!templateBaseCache[substitution.$in]) {
                    templateBaseCache[substitution.$in] = Handlebars.compile(fs.readFileSync(substitution.$in, 'utf8'), { noEscape: true })
                }

                output = mergeDeep(load(templateBaseCache[substitution.$in](item)), cleanup({...substitution}))                
                if (ext === 'yaml') output = dump(output)
                if (ext === 'json') output = JSON.stringify(output)
                if (ext === 'xml') throw new Error('Not supported')
            }
            else if (loadCommand === 'load_xml') output = execSync(`yq -o=${ext} -n '${loadCommand}("${substitution.$in}") * ${JSON.stringify(cleanup({...substitution}))}'`).toString()
            else {
                output = mergeDeep(inputCache[substitution.$in], cleanup({...substitution}))
                if (ext === 'yaml') output = dump(output)
                if (ext === 'json') output = JSON.stringify(output)
                if (ext === 'xml') throw new Error('Not supported')
            }
            await writeFileInt(substitution.$out, replace(output, substitution.$replace || {}))
        })())
    }
}

let start = Date.now()
for (const file of input) parseInput(file)
let end = Date.now()

await Promise.all(promises)
console.log("\x1b[33m" + `Processed ${count} items, ${failed} failed.` + 
    ' Time to emit: ' + (end - start) + 'ms'
    + "\x1b[0m")

if (archiverStream) await archiverStream.finalize()