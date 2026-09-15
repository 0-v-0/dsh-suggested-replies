/**
 * Link DSH packages from the pnpm global store using junctions (Windows).
 * Usage: node scripts/link-dsh-store.mjs
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pnpmStore = process.env.DSH_PNPM_STORE
  ?? 'D:\\dev\\pnpm\\global\\v11\\15b4-18d41f22d5ee8190-0\\node_modules\\.pnpm'

if (!existsSync(pnpmStore)) {
  console.error(`link-dsh-store: pnpm store not found at ${pnpmStore}`)
  process.exit(1)
}

const links = [
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-host-apiproxy',
  '@deepseek-ai/dsh-invariants',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-session-persistence',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-storage-domain',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-workspace',
  '@deepseek-ai/cordis',
  '@deepseek-ai/schemastery',
]

function findStoreDir(packageName) {
  const segments = packageName.split('/')
  const pkgShortName = segments.at(-1)
  const prefix = `@deepseek-ai+${pkgShortName}@`

  const candidates = []
  for (const entry of readdirSync(pnpmStore)) {
    if (!entry.toLowerCase().startsWith(prefix.toLowerCase())) continue
    const dir = join(pnpmStore, entry, 'node_modules', packageName)
    const manifest = join(dir, 'package.json')
    if (!existsSync(manifest)) continue
    const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
    if (parsed.name === packageName) {
      candidates.push({ dir, version: parsed.version })
    }
  }
  if (candidates.length === 0) {
    console.error(`link-dsh-store: ${packageName} not found`)
    return null
  }
  candidates.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }))
  return candidates.at(-1).dir
}

let linked = 0
for (const name of links) {
  const target = findStoreDir(name)
  if (target === null) continue
  const destination = join(root, 'node_modules', name)
  mkdirSync(dirname(destination), { recursive: true })

  // Remove existing junction/dir if present (use rmdir for junctions)
  if (existsSync(destination)) {
    try {
      lstatSync(destination)
      execFileSync('cmd', ['/c', 'rmdir', '/S', '/Q', destination], { stdio: 'pipe' })
    } catch {
      // ignore
    }
  }

  // Create junction
  execFileSync('cmd', ['/c', 'mklink', '/J', destination, target], { stdio: 'pipe' })
  console.log(`linked ${name}`)
  linked++
}
console.log(`Done: ${linked}/${links.length} packages linked`)
