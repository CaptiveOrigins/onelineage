import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('..', import.meta.url))
const files = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)])) : []

/** Every way a page or an extension can keep data. The extension uses none of them. */
const STORAGE = [/chrome\s*\.\s*storage/, /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /\bcaches\s*\.\s*open\b/, /document\s*\.\s*cookie/, /\bopenDatabase\b/, /chrome\s*\.\s*cookies/, /navigator\s*\.\s*storage/, /\bstorage\s*\.\s*(local|sync|session)\b/]

describe('the extension stores nothing', () => {
  const code = [...files(join(app, 'src')), ...files(join(app, 'public')), ...files(join(app, 'dist'))].filter((f) => /\.(ts|js|html|json)$/.test(f))

  it('has no storage API anywhere in its source or its build', () => {
    expect(code.length).toBeGreaterThan(5)
    const hits = code.flatMap((f) => {
      const text = readFileSync(f, 'utf8')
        // The hand-written Chrome types mention storage only in a comment saying it's left out.
        .replace(/\/\*[\s\S]*?\*\//g, '')
      return STORAGE.filter((re) => re.test(text)).map((re) => `${f.slice(app.length)}: ${re}`)
    })
    expect(hits).toEqual([])
  })

  it('asks Chrome for no storage, cookies or content scripts, and lets nothing else message it', () => {
    const m = JSON.parse(readFileSync(join(app, 'public', 'manifest.json'), 'utf8'))
    expect(m.manifest_version).toBe(3)
    expect(m.permissions.sort()).toEqual(['nativeMessaging', 'scripting', 'sidePanel'])
    expect(m.host_permissions).toEqual(['http://127.0.0.1/*'])
    expect(m.externally_connectable).toEqual({ ids: [] })
    expect(m.content_scripts).toBeUndefined()
    expect(m.web_accessible_resources).toBeUndefined()
    expect(m.optional_permissions).toBeUndefined()
    expect(m.optional_host_permissions).toBeUndefined()
  })

  it('never writes into a web page, and registers no external message handlers', () => {
    const src = files(join(app, 'src')).filter((f) => !f.endsWith('sidepanel.ts')).map((f) => readFileSync(f, 'utf8')).join('\n')
    for (const re of [/innerHTML/, /insertAdjacent/, /document\.write/, /insertCSS/, /onMessageExternal/, /onConnectExternal/, /appendChild/]) expect(src).not.toMatch(re)
  })
})
