import { app, BrowserWindow, ipcMain, shell, session, net, safeStorage } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import tls from 'node:tls'
import { createHash } from 'node:crypto'

/* ------------------------------------------------------------------
   Fichiers locaux (dossier utilisateur de l'application)
   ------------------------------------------------------------------ */
const file = (name) => join(app.getPath('userData'), name)
const readJson = (name, fallback) => { try { return JSON.parse(readFileSync(file(name), 'utf8')) } catch { return fallback } }
const writeJson = (name, value) => writeFileSync(file(name), JSON.stringify(value, null, 2))

/* ------------------------------------------------------------------
   Certificats : Frigate (port 8971) utilise par défaut un certificat
   auto-signé. L'utilisateur approuve son empreinte une fois ; elle est
   ensuite exigée à l'identique (un changement de certificat est refusé).
   ------------------------------------------------------------------ */
let trusted = {} // hôte → empreinte SHA-256
const seenCerts = {} // dernier certificat présenté par chaque hôte

function installCertCheck() {
  session.defaultSession.setCertificateVerifyProc((req, done) => {
    if (process.env.FV_DEBUG) console.log('[cert]', req.hostname, req.verificationResult, trusted[req.hostname] === req.certificate.fingerprint)
    const c = req.certificate
    seenCerts[req.hostname] = { fingerprint: c.fingerprint, subject: c.subjectName, issuer: c.issuerName, validExpiry: c.validExpiry, result: req.verificationResult }
    if (req.verificationResult === 'net::OK') return done(0)
    if (trusted[req.hostname] && trusted[req.hostname] === c.fingerprint) return done(0)
    done(-2)
  })
}

// Lecture du certificat AVANT toute requête Chromium : un refus de Chromium est mis en cache
// et empêcherait la connexion juste après l'approbation.
ipcMain.handle('cert:probe', (_e, { host, port }) =>
  new Promise((resolve) => {
    const sock = tls.connect({ host, port: Number(port), servername: /^[\d.]+$/.test(host) ? undefined : host, rejectUnauthorized: false, timeout: 5000 }, () => {
      const c = sock.getPeerCertificate()
      const fingerprint = 'sha256/' + createHash('sha256').update(c.raw).digest('base64')
      resolve({ ok: true, authorized: sock.authorized, trusted: trusted[host] === fingerprint, fingerprint, subject: c.subject?.CN || '', issuer: c.issuer?.CN || '', validTo: c.valid_to })
      sock.end()
    })
    sock.on('timeout', () => { sock.destroy(); resolve({ ok: false, error: 'timeout' }) })
    sock.on('error', (err) => resolve({ ok: false, error: err.code || err.message }))
  })
)

ipcMain.handle('cert:trust', async (_e, { host, fingerprint }) => {
  trusted[host] = fingerprint
  writeJson('trusted-certs.json', trusted)
  // Chromium garde en cache le refus : on vide le cache de vérification et les connexions ouvertes
  session.defaultSession.setCertificateVerifyProc(null)
  installCertCheck()
  await session.defaultSession.closeAllConnections()
  return true
})

/* ------------------------------------------------------------------
   Requêtes HTTP vers Frigate, depuis le processus principal :
   pas de contrainte CORS, et les cookies de session (jeton Frigate)
   sont partagés avec la fenêtre, donc avec les balises <img>.
   ------------------------------------------------------------------ */
ipcMain.handle('http', (_e, { url, method = 'GET', headers = {}, body, timeout = 5000 }) =>
  new Promise((resolve) => {
    const host = new URL(url).hostname
    let settled = false
    const finish = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r) } }
    const req = net.request({ url, method, useSessionCookies: true, redirect: 'manual' })
    for (const [k, v] of Object.entries(headers)) req.setHeader(k, v)
    const timer = setTimeout(() => { req.abort(); finish({ ok: false, status: 0, error: 'timeout' }) }, timeout)
    req.on('response', (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => finish({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', (err) => finish({ ok: false, status: res.statusCode, error: err.message }))
    })
    req.on('error', (err) => { if (process.env.FV_DEBUG) console.log('[http]', url, err.message, JSON.stringify(seenCerts[host]))
      // Un refus par setCertificateVerifyProc remonte en « net::ERR_FAILED » : on se fie au dernier certificat vu
      const seen = seenCerts[host]
      const certErr = /ERR_CERT_|ERR_SSL_/.test(err.message) || (url.startsWith('https:') && seen && seen.result !== 'net::OK' && trusted[host] !== seen.fingerprint)
      finish({ ok: false, status: 0, error: certErr ? 'cert' : err.message, cert: certErr ? seenCerts[host] || null : undefined })
    })
    if (body !== undefined) req.write(body)
    req.end()
  })
)

// Déconnexion : suppression du cookie de session Frigate
ipcMain.handle('auth:logout', async (_e, { origin }) => {
  const cookies = await session.defaultSession.cookies.get({ url: origin })
  await Promise.all(cookies.map((c) => session.defaultSession.cookies.remove(origin, c.name)))
  await session.defaultSession.cookies.flushStore()
  return true
})

/* ------------------------------------------------------------------
   Mot de passe mémorisé, chiffré par le système
   (DPAPI sous Windows, Trousseau sous macOS).
   ------------------------------------------------------------------ */
ipcMain.handle('secret:save', (_e, value) => {
  if (!safeStorage.isEncryptionAvailable()) return false
  writeFileSync(file('credentials.bin'), safeStorage.encryptString(JSON.stringify(value)))
  return true
})
ipcMain.handle('secret:load', () => {
  try { return JSON.parse(safeStorage.decryptString(readFileSync(file('credentials.bin')))) } catch { return null }
})
ipcMain.handle('secret:clear', () => { rmSync(file('credentials.bin'), { force: true }); return true })

/* ------------------------------------------------------------------
   Fenêtre
   ------------------------------------------------------------------ */
function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#111827',
    title: 'FrigateView',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Liens externes : navigateur par défaut
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.FV_SMOKE) smokeTest(win, process.env.FV_SMOKE)

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  trusted = readJson('trusted-certs.json', {})
  installCertCheck()
  // Les <img> de la fenêtre (page locale) vers Frigate sont des requêtes « inter-sites » :
  // le cookie de session (SameSite=Lax) n'y est pas joint. On l'ajoute ici, uniquement
  // pour l'hôte visé par la requête.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://*/api/*'] }, async (details, done) => {
    const headers = details.requestHeaders
    if (!headers.Cookie && details.webContentsId) {
      const cookies = await session.defaultSession.cookies.get({ url: details.url })
      if (cookies.length) headers.Cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    }
    done({ requestHeaders: headers })
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/* ------------------------------------------------------------------
   Test rapide (développement) : FV_SMOKE=/chemin/capture.png
   Optionnel : FV_SMOKE_JS = script exécuté dans la fenêtre avant capture.
   ------------------------------------------------------------------ */
function smokeTest(win, out) {
  if (process.env.FV_DEBUG) win.webContents.on('console-message', (e) => console.log('[page]', e.message))
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      if (process.env.FV_SMOKE_JS) await win.webContents.executeJavaScript(process.env.FV_SMOKE_JS)
      setTimeout(async () => {
        writeFileSync(out, (await win.webContents.capturePage()).toPNG())
        app.quit()
      }, Number(process.env.FV_SMOKE_WAIT || 4000))
    }, 500)
  })
}
