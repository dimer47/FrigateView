import { describe, it, expect } from 'vitest'
import { isExternalUrlSafe, allowedIn, isAllowedHttpUrl, isAppUrl } from '../src/main/guards.js'

describe('isExternalUrlSafe', () => {
  it('accepte http(s)', () => {
    expect(isExternalUrlSafe('https://example.com')).toBe(true)
    expect(isExternalUrlSafe('http://example.com/a')).toBe(true)
  })
  it('refuse le reste', () => {
    for (const u of ['file:///etc/passwd', 'javascript:alert(1)', 'smb://x/y', 'pas une url', '', null]) expect(isExternalUrlSafe(u)).toBe(false)
  })
})

describe('allowedIn', () => {
  const set = new Set(['/home/u/a.json', '/home/u/exports'])
  it('fichier choisi ou directement dans un dossier choisi', () => {
    expect(allowedIn(set, '/home/u/a.json')).toBe(true)
    expect(allowedIn(set, '/home/u/exports/clip.mp4')).toBe(true)
  })
  it('refuse sous-dossier, traversée, vide, non-chaîne', () => {
    expect(allowedIn(set, '/home/u/exports/sub/clip.mp4')).toBe(false)
    expect(allowedIn(set, '/home/u/exports/../secret')).toBe(false)
    expect(allowedIn(set, '')).toBe(false)
    expect(allowedIn(set, 42)).toBe(false)
  })
})

describe('isAllowedHttpUrl', () => {
  const srv = { host: '192.168.1.10', port: 8971 }
  it('même hôte et port', () => {
    expect(isAllowedHttpUrl(srv, 'https://192.168.1.10:8971/api/config')).toBe(true)
    expect(isAllowedHttpUrl({ host: 'NVR.local', port: 443 }, 'https://nvr.local/api')).toBe(true)
    expect(isAllowedHttpUrl({ host: '::1', port: 5000 }, 'http://[::1]:5000/api')).toBe(true)
  })
  it('ports go2rtc en http uniquement', () => {
    expect(isAllowedHttpUrl(srv, 'http://192.168.1.10:1984/api/webrtc')).toBe(true)
    expect(isAllowedHttpUrl(srv, 'http://192.168.1.10:8555/')).toBe(true)
    expect(isAllowedHttpUrl(srv, 'https://192.168.1.10:1984/')).toBe(false)
  })
  it('refuse autre hôte, autre port, identifiants, protocole, serveur absent', () => {
    expect(isAllowedHttpUrl(srv, 'https://192.168.1.11:8971/')).toBe(false)
    expect(isAllowedHttpUrl(srv, 'https://192.168.1.10:22/')).toBe(false)
    expect(isAllowedHttpUrl(srv, 'https://u:p@192.168.1.10:8971/')).toBe(false)
    expect(isAllowedHttpUrl(srv, 'ftp://192.168.1.10:8971/')).toBe(false)
    expect(isAllowedHttpUrl(null, 'https://192.168.1.10:8971/')).toBe(false)
    expect(isAllowedHttpUrl(srv, 'n importe quoi')).toBe(false)
  })
})

describe('isAppUrl', () => {
  it('origine de dev', () => {
    expect(isAppUrl('http://localhost:5173/#/x', { devUrl: 'http://localhost:5173' })).toBe(true)
    expect(isAppUrl('http://localhost:5174/', { devUrl: 'http://localhost:5173' })).toBe(false)
  })
  it('fichier de l’application', () => {
    expect(isAppUrl('file:///app/out/renderer/index.html', { appFile: '/app/out/renderer/index.html' })).toBe(true)
    expect(isAppUrl('file:///C:/App/out/index.html', { appFile: 'C:\\App\\out\\index.html' })).toBe(true)
    expect(isAppUrl('file:///app/other.html', { appFile: '/app/out/renderer/index.html' })).toBe(false)
  })
  it('refuse le reste', () => {
    expect(isAppUrl('https://evil.com')).toBe(false)
    expect(isAppUrl('???')).toBe(false)
  })
})

describe('buildMultipart', () => {
  it('corps multipart avec le fichier', async () => {
    const { buildMultipart } = await import('../src/main/guards.js')
    const m = buildMultipart({ field: 'file', filename: 'a"b.jpg', type: 'image/jpeg', base64: Buffer.from('JPEG').toString('base64') }, 'XX')
    expect(m.contentType).toBe('multipart/form-data; boundary=XX')
    const s = m.body.toString()
    expect(s).toContain('name="file"; filename="a_b.jpg"')
    expect(s).toContain('Content-Type: image/jpeg\r\n\r\nJPEG\r\n--XX--')
  })
  it('refuse type, vide, trop gros', async () => {
    const { buildMultipart, UPLOAD_MAX } = await import('../src/main/guards.js')
    expect(() => buildMultipart({ type: 'text/html', base64: 'QQ==' }, 'X')).toThrow()
    expect(() => buildMultipart({ type: 'image/png', base64: '' }, 'X')).toThrow()
    expect(() => buildMultipart({ type: 'image/png', base64: Buffer.alloc(UPLOAD_MAX + 1).toString('base64') }, 'X')).toThrow()
    expect(() => buildMultipart(null, 'X')).toThrow()
  })
})
