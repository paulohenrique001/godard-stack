import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tauri = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tauri.cmd' : 'tauri')
const javaLibraries = join(root, 'build', 'desktop-resources', 'java-runtime', 'lib', 'server')
const libraryPath = [javaLibraries, process.env.LD_LIBRARY_PATH].filter(Boolean).join(delimiter)
const appImageRuntime = join(root, 'build', 'appimage-tools', 'runtime-x86_64')
const environment = { ...process.env, LD_LIBRARY_PATH: libraryPath }

if (!environment.LDAI_RUNTIME_FILE && existsSync(appImageRuntime)) {
  environment.LDAI_RUNTIME_FILE = appImageRuntime
}

const result = spawnSync(tauri, ['build', ...process.argv.slice(2)], {
  cwd: root,
  env: environment,
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}

process.exitCode = result.status ?? 1
