#!/usr/bin/env node
import { execSync, spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, 'fixtures')
const tridentBin = path.join(__dirname, '..', 'index.js')

let jestDiff
try {
  jestDiff = (await import('jest-diff')).diff
} catch {
  console.log('jest-diff not installed, will show raw output on failures')
  jestDiff = null
}

const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
}

function normalizeOutput(output) {
  return output
    .split('\n')
    .filter(line => !line.includes('Time to emit:'))
    .filter(line => !line.includes('Processed'))
    .join('\n')
    .trim()
}

function runTrident(args, cwd) {

  const result = spawnSync(process.argv0, [tridentBin, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' }
  })
  const output = (result.stdout || '') + (result.stderr || '')
  return {
    output: normalizeOutput(output),
    exitCode: result.status
  }
}

async function runTest(fixturePath) {
  const testName = path.basename(fixturePath)
  const configPath = path.join(fixturePath, 'test.json')

  if (!fs.existsSync(configPath)) {
    return { name: testName, status: 'skip', reason: 'no test.json' }
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const snapshotPath = path.join(fixturePath, 'snapshot.txt')

  const args = ['--dry', ...(config.args || ['-i', '.'])]
  const { output, exitCode } = runTrident(args, fixturePath)

  if (config.expectFail && exitCode === 0) {
    return { name: testName, status: 'fail', reason: 'expected failure but succeeded' }
  }
  if (!config.expectFail && exitCode !== 0) {
    return { name: testName, status: 'fail', reason: `exit code ${exitCode}`, output }
  }

  if (process.argv.includes('--update') || process.argv.includes('-u')) {
    fs.writeFileSync(snapshotPath, output)
    return { name: testName, status: 'updated' }
  }

  if (!fs.existsSync(snapshotPath)) {
    fs.writeFileSync(snapshotPath, output)
    return { name: testName, status: 'created' }
  }

  const expected = fs.readFileSync(snapshotPath, 'utf8').trim()

  if (output === expected) {
    return { name: testName, status: 'pass' }
  }

  return {
    name: testName,
    status: 'fail',
    expected,
    actual: output,
    diff: jestDiff ? jestDiff(expected, output, { expand: false }) : null
  }
}

async function main() {
  console.log(colors.cyan('\nTrident Test Runner\n'))

  const fixtures = fs.readdirSync(fixturesDir)
    .map(name => path.join(fixturesDir, name))
    .filter(p => fs.statSync(p).isDirectory())
    .sort()

  const results = []

  for (const fixture of fixtures) {
    const result = await runTest(fixture)
    results.push(result)

    const icon = {
      pass: colors.green('✓'),
      fail: colors.red('✗'),
      skip: colors.yellow('○'),
      created: colors.cyan('+'),
      updated: colors.cyan('↻'),
    }[result.status]

    console.log(`  ${icon} ${result.name}`)

    if (result.status === 'fail') {
      if (result.reason) {
        console.log(colors.dim(`    ${result.reason}`))
      }
      if (result.diff) {
        console.log(result.diff.split('\n').map(l => '    ' + l).join('\n'))
      } else if (result.actual && result.expected) {
        console.log(colors.dim('    Expected:'))
        console.log(result.expected.split('\n').slice(0, 10).map(l => '      ' + l).join('\n'))
        console.log(colors.dim('    Actual:'))
        console.log(result.actual.split('\n').slice(0, 10).map(l => '      ' + l).join('\n'))
      }
    }
  }

  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const skipped = results.filter(r => r.status === 'skip').length
  const created = results.filter(r => r.status === 'created').length
  const updated = results.filter(r => r.status === 'updated').length

  console.log('')
  if (created > 0) console.log(colors.cyan(`  ${created} snapshot(s) created`))
  if (updated > 0) console.log(colors.cyan(`  ${updated} snapshot(s) updated`))
  console.log(colors.green(`  ${passed} passed`),
              failed > 0 ? colors.red(`${failed} failed`) : '',
              skipped > 0 ? colors.yellow(`${skipped} skipped`) : '')
  console.log('')

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
