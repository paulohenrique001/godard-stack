import { chmod, cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const backend = join(root, 'backend')
const output = join(root, 'build', 'desktop-resources')

function execute(command, argumentsList) {
  const result = spawnSync(command, argumentsList, { cwd: root, encoding: 'utf8', stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`${command} não foi concluído.`)
  }
}

function javaHome() {
  if (process.env.JAVA_HOME) {
    return process.env.JAVA_HOME
  }
  const result = spawnSync('java', ['-XshowSettings:properties', '-version'], { encoding: 'utf8' })
  const outputText = `${result.stdout}\n${result.stderr}`
  const match = outputText.match(/^\s*java\.home\s*=\s*(.+)$/m)
  if (!match) {
    throw new Error('JAVA_HOME não foi encontrado.')
  }
  return match[1].trim()
}

async function makeOwnerWritable(path) {
  const details = await stat(path)
  await chmod(path, (details.mode & 0o777) | 0o200)
  if (!details.isDirectory()) {
    return
  }
  for (const entry of await readdir(path)) {
    await makeOwnerWritable(join(path, entry))
  }
}

async function makeOwnerWritableIfPresent(path) {
  try {
    await makeOwnerWritable(path)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
}

execute('mvn', ['-B', `-Dmaven.repo.local=${join(root, 'build', 'maven-repository')}`, '-f', 'backend/pom.xml', 'package'])
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })

const home = javaHome()
const modules = [
  'java.base',
  'java.compiler',
  'java.desktop',
  'java.instrument',
  'java.logging',
  'java.management',
  'java.naming',
  'java.net.http',
  'java.scripting',
  'java.security.jgss',
  'java.sql',
  'java.transaction.xa',
  'java.xml',
  'jdk.crypto.ec',
  'jdk.management',
  'jdk.unsupported',
]

execute(join(home, 'bin', 'jlink'), [
  '--add-modules', modules.join(','),
  '--strip-debug',
  '--no-man-pages',
  '--no-header-files',
  '--compress=zip-6',
  '--output', join(output, 'java-runtime'),
])
await makeOwnerWritable(join(output, 'java-runtime'))
await cp(join(backend, 'target', 'godard-stack.jar'), join(output, 'godard-stack.jar'))

for (const profile of ['debug', 'release']) {
  const target = join(root, 'src-tauri', 'target', profile)
  await makeOwnerWritableIfPresent(join(target, 'godard-stack.jar'))
  await makeOwnerWritableIfPresent(join(target, 'java-runtime'))
}

console.log(`Recursos desktop preparados em ${output}`)

