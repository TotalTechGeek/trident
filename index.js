#!/usr/bin/env node 
import { execSync } from 'child_process'
import { load, loadAll, dump } from 'js-yaml'
import fs from 'fs'
import Handlebars from 'handlebars'
import Ajv from 'ajv'
import { prettify } from 'awesome-ajv-errors'
import { parseArgs } from 'util'
import querystring from 'querystring'
import { mkdir, writeFile, copyFile, rm } from 'fs/promises'
import path from 'path'
import { globSync } from 'glob'
import archiver from 'archiver'
import helpers from 'handlebars-helpers'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'

// This is a workaround to allow the $values to be shared between the import and derived templates
const ATTACHED = Symbol('attached')

let { input, values, valueFile, archive, enableTemplateBase, dry, allowValuesSharing, relativeToManifest, relativeToTemplate, relative, base, 'enable-exec': enableExec } = parseArgs({
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
        base: { type: 'boolean' },
        'enable-exec': { type: 'boolean' }
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

if (enableExec) Handlebars.registerHelper('exec', (command) => execSync(command).toString().trim())
Handlebars.registerHelper('min', (...args) => Math.min(...args.slice(0, -1)))
Handlebars.registerHelper('max', (...args) => Math.max(...args.slice(0, -1)))
Handlebars.registerHelper('json', ctx => JSON.stringify(ctx))
Handlebars.registerHelper('yaml', ctx => dump(ctx))
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

const templateBaseCache = {}
const inputCache = {}
const archives = {}
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" })
const xmlBuilder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@", format: true })

function createArchive (archive) {
    if (!archive) return
    archive = path.resolve(archive)
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

    const dir = file.split('/').slice(0, -1).join('/')
    if (dir) await mkdir(dir, { recursive: true })
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


async function processTemplate (template, manifest, schema = { type: 'object', properties: { name: { type: 'string' }}, required: ['name'], additionalProperties: true }, {
    templateLocation = '.',
    $values = values,
    additional = null,
    archiverStream = null,
    chdir = '.',
    parallel = false
} = {}) {
    templateLocation = path.resolve(templateLocation)
    chdir = path.resolve(chdir)
    const substituteTemplate = Handlebars.compile(template, { noEscape: true })
    
    const validate = ajv.compile(schema)
    let promises = []


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

        async function executeSubstitution (substitution) {
            if (!substitution) return
            if (substitution.$mkdir) {
                if (typeof substitution.$mkdir === 'string') substitution.$mkdir = [substitution.$mkdir]
                for (const dir of substitution.$mkdir) fs.mkdirSync(resolvePath(dir, templateLocation), { recursive: true })
            }

            if (substitution.$chdir) {
                if (!fs.existsSync(resolvePath(substitution.$chdir, templateLocation))) fs.mkdirSync(resolvePath(substitution.$chdir, templateLocation), { recursive: true })
                process.chdir(resolvePath(substitution.$chdir, templateLocation))
            }

            if (substitution.$rm) {
                if (typeof substitution.$rm === 'string') substitution.$rm = [substitution.$rm]
                for (const dir of substitution.$rm) await rm(resolvePath(dir, templateLocation), { recursive: true, force: true })
            }

            if (substitution.$template && substitution.$manifest) {
                const location = resolvePath(substitution.$template, templateLocation)
                const template = readTemplate(location)
                let manifest = substitution.$manifest
                if (typeof manifest === 'string') manifest = loadAll(fs.readFileSync(resolvePath(manifest, templateLocation), 'utf8'))
                const schema = substitution.$schema ? load(fs.readFileSync(resolvePath(substitution.$schema, templateLocation), 'utf8')) : undefined
                await processTemplate(template, manifest, schema, {
                    templateLocation: location,
                    $values: $values[ATTACHED],
                    additional: { ...item, ...cleanup({...substitution}) },
                    parallel: true,
                    archiverStream: substitution.$archive ? createArchive(substitution.$archive) : archiverStream
                })
                return
            }

            if (substitution.$copy) {
                let $copy = substitution.$copy
                if ($copy.files) $copy = $copy.files
                if (typeof $copy === 'string') $copy = $copy.split(',').map(file => file.trim())
                const files = globSync($copy, {
                    ...(relative && { cwd: path.dirname(templateLocation) })
                })
                for (const file of files) await copyFileInt(resolvePath(file, templateLocation), substitution.$out, archiverStream)
                return
            }

            if (substitution.$exec) {
                if (enableExec) execSync(substitution.$exec)
                else throw new Error('Execution not enabled')
                return
            }

            if (substitution.$merge) {
                let $files = substitution.$merge.files 
                if (typeof $files === 'string') $files = $files.split(',').map(file => file.trim())
                let merged = ''

                const archive = createArchive(substitution.$archive) ?? archiverStream
                for (const file of $files) {
                    const files = globSync(file, {
                        ...(relative && { cwd: path.dirname(templateLocation) })
                    })
                    // Note: I could add streaming out support for this
                    for (const file of files) merged += fs.readFileSync(resolvePath(file, templateLocation), 'utf8').toString() + (substitution.$merge.separator ?? '')
                }
                await writeFileInt(substitution.$out, replace(merged, substitution.$replace || {}), archive)
                return
            }
    
            
            if (!substitution.$in) return

            const ext = path.extname(substitution.$out).substring(1)
            let loadCommand = path.extname(substitution.$in) === '.xml' ? 'load_xml' : 'load'

            substitution.$in = resolvePath(substitution.$in, templateLocation)
            
            let output 
            if (!enableTemplateBase && !inputCache[substitution.$in]) inputCache[substitution.$in] = load(fs.readFileSync(substitution.$in, 'utf8'))

            if (enableTemplateBase) {
                if (!templateBaseCache[substitution.$in]) {
                    templateBaseCache[substitution.$in] = Handlebars.compile(fs.readFileSync(substitution.$in, 'utf8'), { noEscape: true })
                }

                output = mergeDeep(load(templateBaseCache[substitution.$in](item)), cleanup({...substitution}))                
                if (ext === 'yaml') output = dump(output)
                if (ext === 'json') output = JSON.stringify(output)
                if (ext === 'xml') output = xmlBuilder.build(output)
            }
            else if (loadCommand === 'load_xml') {
                output = mergeDeep(xmlParser.parse(fs.readFileSync(substitution.$in, 'utf8')), cleanup({...substitution}))
                if (ext === 'yaml') output = dump(output)
                if (ext === 'json') output = JSON.stringify(output)
                if (ext === 'xml') output = xmlBuilder.build(output)
            }
            else {
                output = mergeDeep(structuredClone(inputCache[substitution.$in]), cleanup({...substitution}))
                if (ext === 'yaml') output = dump(output)
                if (ext === 'json') output = JSON.stringify(output)
                if (ext === 'xml') output = xmlBuilder.build(output)
            }
            await writeFileInt(substitution.$out, replace(output, substitution.$replace || {}), archiverStream)
        
        }

        for (const substitution of config) {
            if (parallel) promises.push(executeSubstitution(substitution))
            else await executeSubstitution(substitution)
        }
    }
    await Promise.all(promises)
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
    
    const schemaDoc = schema ? load(fs.readFileSync(schema, 'utf8')) : undefined
    const manifestData = typeof manifest === 'string' ? loadAll(fs.readFileSync(manifest, 'utf8')) : manifest

    return processTemplate(readTemplate(template), manifestData, schemaDoc, {
        templateLocation: template,
        archiverStream: createArchive(archive)
    })    
}

let start = Date.now()
for (const file of input) await parseInput(file)
let end = Date.now()

console.log("\x1b[33m" + `Processed ${count} items, ${failed} failed.` + 
    ' Time to emit: ' + (end - start) + 'ms'
    + "\x1b[0m")

for (const key in archives) archives[key].finalize()