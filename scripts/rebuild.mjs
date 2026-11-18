import { execSync } from 'node:child_process'
import { utimesSync } from 'node:fs'

const now = new Date()
utimesSync('agent/pom.xml', now, now)

execSync('docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build --force-recreate -d', {
  stdio: 'inherit',
})
