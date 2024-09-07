#!/usr/bin/env node
import { execSync } from 'child_process'
import { parseAllDocuments } from 'yaml'
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

let { input, values, valueFile, archive } = parseArgs({
    options: {
        input: { type: 'string', short: 'i', multiple: true },
        values: { type: 'string', short: 'v', multiple: true },
        valueFile: { type: 'string', short: 'f', multiple: true },
        archive: { type: 'string', short: 'a' }
    }
}).values
values = [...(values || [])].map(value => querystring.parse(value)).reduce((acc, value) => ({ ...acc, ...value }), {})

for (let file of valueFile || []) {
    let varName = file 
    if (file.includes('=')) [varName, file] = file.split('=')
    else varName = path.basename(file, path.extname(file))
    const content = parseAllDocuments(fs.readFileSync(file, 'utf8')).map(doc => doc.toJSON())
    values[varName] = content.reduce((acc, value) => ({ ...acc, ...value }), {})
}

if (!input) throw new Error('No input file specified')

const ajv = new Ajv({ useDefaults: true, allErrors: true })
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

function parseInput(input) {
    const [template, manifest, schema] = getFiles(input)

    const substituteTemplate = Handlebars.compile(fs.readFileSync(template, 'utf8'), { noEscape: true })
    
    let schemaDoc = { type: 'object', properties: { name: { type: 'string' }}, required: ['name'], additionalProperties: true }
    if (schema) schemaDoc = JSON.parse(fs.readFileSync(schema, 'utf8'))
    const validate = ajv.compile(schemaDoc)
    
    
    async function writeFileInt (file, content) {
        if (archiverStream) {
            archiverStream.append(content, { name: file })
            return
        }
    
        await mkdir(file.split('/').slice(0, -1).join('/'), { recursive: true })
        await writeFile(file, content)
    }
    
    async function copyFileInt (file, output) {
        if (archiverStream) {
            archiverStream.file(file, { name: output + '/' + path.basename(file) })
            return
        }
    
        await mkdir(output, { recursive: true })
        await copyFile(file, output + '/' + path.basename(file))
    }
    
    for (const item of parseAllDocuments(fs.readFileSync(manifest, 'utf8')).map(doc => doc.toJSON())) {
        count++
        item.$values = values
        if (!validate(item)) {
            console.error("\x1b[33m" + `Error occurred on "${item?.name ?? '$[' + (count-1) + ']'}"`)
            console.error(prettify(validate, { data: item }))
            failed++
            continue
        }
        const config = parseAllDocuments(substituteTemplate(item)).map(doc => doc.toJSON())
        for (const substitution of config) promises.push((async () => {
            if (!substitution) return
            if (substitution.$copy) {
                const files = globSync(substitution.$copy.split(',').map(file => file.trim()))
                for (const file of files) await copyFileInt(file, substitution.$out)
                return
            }
    
            if (!substitution.$in) return
            const ext = path.extname(substitution.$out).substring(1)
            const loadCommand = path.extname(substitution.$in) === '.xml' ? 'load_xml' : 'load'
            await writeFileInt(substitution.$out, execSync(`yq -o=${ext} -n '${loadCommand}("${substitution.$in}") * ${JSON.stringify(cleanup(substitution))}'`).toString())
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