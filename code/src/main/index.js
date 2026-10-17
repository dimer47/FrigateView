import { app, BrowserWindow, ipcMain, shell, session, net, safeStorage, Notification, Tray, Menu, screen, nativeImage, dialog } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, rmSync, createWriteStream } from 'node:fs'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import tls from 'node:tls'
import os from 'node:os'
import { createHash, randomBytes } from 'node:crypto'
import { resolveLang, translate } from '../shared/langs'
import { initUpdater } from './updater'
import { isAllowedHttpUrl, isExternalUrlSafe, allowedIn as allowedInSet, isAppUrl, buildMultipart } from './guards'

// Liens externes : http(s) seulement
const openExternal = (url) => { if (isExternalUrlSafe(url)) shell.openExternal(url) }
let checkUpdates = () => {}

// Traductions (les mêmes fichiers que la fenêtre)
const LOCALES = Object.fromEntries(Object.entries(import.meta.glob('../shared/locales/*.json', { eager: true, import: 'default' })).map(([p, m]) => [p.match(/(\w+)\.json$/)[1], m]))
const lang = () => resolveLang(settings.lang, app.getLocale())
const tr = (key, vars) => translate(LOCALES[lang()] || {}, key, vars) ?? translate(LOCALES.en || {}, key, vars) ?? translate(LOCALES.fr, key, vars) ?? key

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
// Serveur Frigate courant : seul hôte joignable par l'IPC 'http'.
// Fixé par cert:probe (mode sécurisé, avant toute requête) ou, à défaut, par la première
// requête de la session (mode local) ; remis à zéro à la déconnexion (changement de serveur).
let currentServer = null
ipcMain.handle('cert:probe', (_e, { host, port }) =>
  new Promise((resolve) => {
    currentServer = { host: String(host), port: String(port) }
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
function checkServerUrl(url) {
  let u
  try { u = new URL(url) } catch { return false }
  if (!currentServer && (u.protocol === 'http:' || u.protocol === 'https:')) currentServer = { host: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || (u.protocol === 'https:' ? '443' : '80') }
  return isAllowedHttpUrl(currentServer, url)
}

ipcMain.handle('http', (_e, { url, method = 'GET', headers = {}, body, upload, timeout = 5000 }) =>
  new Promise((resolve) => {
    if (!checkServerUrl(url)) return resolve({ ok: false, status: 0, error: `refused: ${String(url).slice(0, 200)} n'est pas sur le serveur Frigate courant (${currentServer ? currentServer.host + ':' + currentServer.port : 'aucun'})` })
    // Image envoyée (ex. /api/faces/{nom}/register) : multipart construit ici, POST uniquement
    if (upload) {
      try { const m = buildMultipart(upload, 'fv' + randomBytes(12).toString('hex')); body = m.body; headers = { ...headers, 'Content-Type': m.contentType }; method = 'POST' } catch (err) { return resolve({ ok: false, status: 0, error: err.message }) }
    }
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
/* ------------------------------------------------------------------
   Fichiers : captures et clips enregistrés sur le disque.
   Seuls les chemins choisis par l'utilisateur dans une boîte de dialogue
   peuvent être écrits (la fenêtre ne peut pas viser un autre fichier).
   ------------------------------------------------------------------ */
const allowedPaths = new Set()
const allow = (p) => { if (p) allowedPaths.add(p); return p }
// Fichier choisi, ou fichier placé directement dans un dossier choisi
const allowedIn = (p) => allowedInSet(allowedPaths, p)
const winOf = (e) => BrowserWindow.fromWebContents(e.sender)

ipcMain.handle('file:chooseSave', async (e, { defaultName, kind }) => {
  if (process.env.FV_SMOKE_SAVE) return allow(join(process.env.FV_SMOKE_SAVE, defaultName)) // tests automatiques
  const filters = kind === 'image' ? [{ name: 'Image', extensions: ['jpg', 'png'] }] : [{ name: 'Vidéo MP4', extensions: ['mp4'] }]
  const r = await dialog.showSaveDialog(winOf(e), { defaultPath: join(app.getPath(kind === 'image' ? 'pictures' : 'videos'), defaultName), filters })
  return r.canceled ? null : allow(r.filePath)
})
ipcMain.handle('file:chooseDir', async (e) => {
  if (process.env.FV_SMOKE_SAVE) return allow(process.env.FV_SMOKE_SAVE)
  const r = await dialog.showOpenDialog(winOf(e), { defaultPath: app.getPath('videos'), properties: ['openDirectory', 'createDirectory'] })
  return r.canceled ? null : allow(r.filePaths[0])
})
ipcMain.handle('file:write', (_e, { path, data }) => {
  if (!allowedIn(path)) return false
  try { writeFileSync(path, Buffer.from(data)); return true } catch (err) { console.error('[file:write]', err.message); return false }
})
ipcMain.handle('file:reveal', (_e, path) => { if (allowedIn(path)) shell.showItemInFolder(path) })

// Téléchargement en flux (clips de plusieurs centaines de Mo), progression envoyée à la fenêtre
const downloads = new Map()
ipcMain.handle('file:download', (e, { id, url, path }) =>
  new Promise((resolve) => {
    if (!allowedIn(path) || !checkServerUrl(url)) return resolve({ ok: false, error: 'refused' })
    const req = net.request({ url, useSessionCookies: true })
    downloads.set(id, req)
    let settled = false
    const done = (r) => { if (settled) return; settled = true; downloads.delete(id); if (!r.ok) rmSync(path, { force: true }); resolve(r) }
    req.on('response', (res) => {
      if (res.statusCode !== 200) { res.resume?.(); return done({ ok: false, status: res.statusCode }) }
      const total = Number(res.headers['content-length']) || 0
      let loaded = 0, last = 0
      const progress = new Transform({ transform(c, _enc, cb) {
        loaded += c.length
        if (Date.now() - last > 300) { last = Date.now(); if (!e.sender.isDestroyed()) e.sender.send('download:progress', { id, loaded, total }) }
        cb(null, c)
      } })
      // pipeline : contre-pression (lecture suspendue tant que le disque n'a pas suivi)
      // et, sur erreur d'écriture (disque plein…), arrêt de la requête + suppression du fichier partiel
      pipeline(res, progress, createWriteStream(path))
        .then(() => done({ ok: true, size: loaded }))
        .catch((err) => { try { req.abort() } catch { /* déjà terminée */ } done({ ok: false, error: err.message }) })
    })
    req.on('error', (err) => done({ ok: false, error: err.message }))
    req.on('abort', () => done({ ok: false, error: 'aborted' }))
    req.end()
  })
)
ipcMain.handle('file:cancel', (_e, id) => { downloads.get(id)?.abort() })

ipcMain.handle('auth:logout', async (_e, { origin }) => {
  currentServer = null // changement de serveur possible ensuite
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
   Réglages de l'application (lus par le processus principal :
   zone de notification, fermeture, démarrage, écrans)
   ------------------------------------------------------------------ */
const DEFAULTS = {
  lang: null, // null = langue du système
  notify: true,
  notifyTypes: { person: true, car: false, animal: false, other: false },
  notifySound: true,
  watchFaces: [], // personnes surveillées (noms /api/faces)
  watchPlates: [], // plaques surveillées (noms known_plates ou plaques brutes)
  watchUnknownFace: false,
  dnd: false,
  startAtLogin: false,
  startHidden: false,
  closeToTray: true,
  screens: {} // id d'écran → { layout, enabled }
}
let settings = DEFAULTS
const saveSettings = () => writeJson('settings.json', settings)

ipcMain.handle('settings:get', () => ({ ...settings, systemLocale: app.getLocale() }))
ipcMain.handle('settings:set', (_e, patch) => {
  settings = { ...settings, ...patch }
  saveSettings()
  applySettings()
  return { ...settings, systemLocale: app.getLocale() }
})

function applySettings() {
  // Démarrage avec Windows (sans effet en développement)
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.startAtLogin, args: settings.startHidden ? ['--hidden'] : [] })
  refreshTray()
  buildMenu()
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('settings:changed', { ...settings, systemLocale: app.getLocale() })
}

/* ------------------------------------------------------------------
   Icône de l'application (aussi pour la zone de notification)
   ------------------------------------------------------------------ */
const iconPath = () => join(app.isPackaged ? process.resourcesPath : join(__dirname, '../../build'), 'icon.png')
const appIcon = () => nativeImage.createFromPath(iconPath())

/* ------------------------------------------------------------------
   Fenêtres : une principale, et un mur vidéo par écran supplémentaire
   ------------------------------------------------------------------ */
let mainWin = null
let tray = null
let quitting = false
const walls = new Map() // id d'écran → fenêtre

function loadRenderer(win, query = {}) {
  const qs = new URLSearchParams(query).toString()
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL + (qs ? '?' + qs : ''))
  else win.loadFile(join(__dirname, '../renderer/index.html'), { query })
}

function baseOptions() {
  return {
    backgroundColor: '#111827',
    title: 'FrigateView',
    icon: appIcon(),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  }
}

// Toutes les fenêtres : pas de nouvelle fenêtre (liens http(s) ouverts dans le navigateur),
// pas de navigation hors de la page locale de l'application
const APP_PAGE = join(__dirname, '../renderer/index.html')
function harden(win) {
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' } })
  const guard = (e, url) => { if (!isAppUrl(url, { devUrl: process.env.ELECTRON_RENDERER_URL, appFile: APP_PAGE })) { e.preventDefault(); openExternal(url) } }
  win.webContents.on('will-navigate', guard)
  win.webContents.on('will-redirect', guard)
  win.webContents.on('will-attach-webview', (e) => e.preventDefault())
  return win
}

function createWindow() {
  const win = harden(new BrowserWindow({ ...baseOptions(), width: 1600, height: 950, minWidth: 1000, minHeight: 640, show: !process.argv.includes('--hidden') }))
  mainWin = win


  // Fermer = réduire dans la zone de notification (les alertes continuent d'arriver)
  win.on('close', (e) => {
    if (!quitting && settings.closeToTray && tray) {
      e.preventDefault()
      win.hide()
      if (!settings._trayHintShown && Notification.isSupported()) {
        new Notification({ title: tr('main.stillRunning'), body: tr('main.stillRunningBody'), icon: appIcon() }).show()
        settings._trayHintShown = true
        saveSettings()
      }
    }
  })
  win.on('closed', () => { mainWin = null })

  if (process.env.FV_SMOKE) smokeTest(win, process.env.FV_SMOKE)
  loadRenderer(win)
}

function showMain() {
  if (!mainWin) createWindow()
  if (mainWin.isMinimized()) mainWin.restore()
  mainWin.show()
  mainWin.focus()
}

ipcMain.handle('screens:list', () => {
  const primary = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: String(d.id), index: i + 1, primary: d.id === primary,
    label: d.label || `Écran ${i + 1}`, width: d.size.width, height: d.size.height,
    current: mainWin ? screen.getDisplayMatching(mainWin.getBounds()).id === d.id : false
  }))
})

// Ouvre / ferme les murs vidéo selon les réglages
function syncWalls() {
  const displays = screen.getAllDisplays()
  for (const [id, w] of walls) {
    const conf = settings.screens[id]
    if (!conf?.enabled || !displays.some((d) => String(d.id) === id)) { walls.delete(id); if (!w.isDestroyed()) w.destroy() }
  }
  for (const d of displays) {
    const id = String(d.id), conf = settings.screens[id]
    if (!conf?.enabled || !conf.layout) continue
    let w = walls.get(id)
    if (!w || w.isDestroyed()) {
      // macOS : plein écran « simple » (pas d'animation ni d'espace séparé, la barre de menu est masquée)
      const mac = process.platform === 'darwin'
      w = harden(new BrowserWindow({ ...baseOptions(), x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, fullscreen: !mac, frame: false }))
      if (mac) w.setSimpleFullScreen(true)
      w.setMenu(null)
      if (process.env.FV_DEBUG) w.webContents.on('console-message', (e) => console.log(`[mur ${id}]`, e.message))
      w.on('close', (e) => { if (!quitting) { e.preventDefault(); settings.screens[id] = { ...settings.screens[id], enabled: false }; saveSettings(); syncWalls(); applySettings() } })
      walls.set(id, w)
      loadRenderer(w, { wall: '1', layout: conf.layout, mode: conf.mode || '' })
    } else w.webContents.send('wall:layout', { layout: conf.layout, mode: conf.mode || '' })
  }
}
// applySettings : la fenêtre des réglages reçoit la nouvelle configuration (sinon elle rouvre l'ancienne)
ipcMain.handle('screens:apply', (_e, screensConf) => { settings = { ...settings, screens: screensConf }; saveSettings(); syncWalls(); applySettings(); return true })
function identifyScreens() {
  // Grand numéro affiché 2 s sur chaque écran
  screen.getAllDisplays().forEach((d, i) => {
    const w = harden(new BrowserWindow({ x: d.bounds.x + d.bounds.width / 2 - 160, y: d.bounds.y + d.bounds.height / 2 - 120, width: 320, height: 240, frame: false, transparent: true, alwaysOnTop: true, focusable: false, skipTaskbar: true, webPreferences: { sandbox: true, contextIsolation: true } }))
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font:800 160px system-ui;color:#fff;background:rgba(59,130,246,.92);border-radius:28px">${i + 1}</body>`))
    setTimeout(() => !w.isDestroyed() && w.destroy(), 2000)
  })
}
ipcMain.handle('screens:identify', () => { identifyScreens(); return true })

/* ------------------------------------------------------------------
   Notifications Windows
   ------------------------------------------------------------------ */
ipcMain.handle('notify', (_e, { title, body, id }) => {
  if (!Notification.isSupported()) return false
  const n = new Notification({ title, body, icon: appIcon(), silent: !settings.notifySound })
  n.on('click', () => { showMain(); mainWin?.webContents.send('notification:click', id) })
  n.show()
  return true
})
/* ------------------------------------------------------------------
   Menu de l'application
   Chaque entrée envoie une commande à la fenêtre principale ; la fenêtre
   renvoie son état (layouts, panneaux, lecture…) pour cocher les entrées.
   Les raccourcis déjà gérés par la fenêtre sont seulement affichés
   (registerAccelerator: false), pour ne pas être déclenchés deux fois.
   ------------------------------------------------------------------ */
let uiState = { connected: false, layouts: [], activeLayout: null, sidebar: true, events: true, timeline: true, expand: false, liveMode: 'webrtc', live: true, playing: true, sync: true, unseen: 0, admin: false, version: '' }
const send = (cmd, arg) => { showMain(); mainWin?.webContents.send('menu:command', { cmd, arg }) }
const shown = (accelerator) => ({ accelerator, registerAccelerator: false })
let menuTimer = null
ipcMain.handle('menu:state', (_e, st) => { uiState = { ...uiState, ...st }; clearTimeout(menuTimer); menuTimer = setTimeout(buildMenu, 50); return true })

function buildMenu() {
  const c = uiState.connected
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu', label: 'FrigateView' }] : []),
    {
      label: tr('menu.file'),
      submenu: [
        { label: tr('menu.newLayout'), accelerator: 'CmdOrCtrl+N', enabled: c, click: () => send('layout:new') },
        { type: 'separator' },
        { label: tr('menu.settings'), ...shown('CmdOrCtrl+,'), click: () => send('settings') },
        { type: 'separator' },
        { label: tr('menu.changeServer'), enabled: uiState.hasServer, click: () => send('server:change') },
        { label: tr('menu.signOut'), enabled: uiState.hasServer, click: () => send('server:signout') },
        { type: 'separator' },
        { label: tr('menu.closeWindow'), accelerator: 'CmdOrCtrl+W', click: () => mainWin?.close() },
        // macOS : « Quitter » est déjà dans le menu de l'application
        ...(isMac ? [] : [{ label: tr('menu.quit'), accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit() } }])
      ]
    },
    {
      label: tr('menu.edit'),
      submenu: [
        { label: tr('menu.undo'), role: 'undo' },
        { label: tr('menu.redo'), role: 'redo' },
        { type: 'separator' },
        { label: tr('menu.cut'), role: 'cut' },
        { label: tr('menu.copy'), role: 'copy' },
        { label: tr('menu.paste'), role: 'paste' },
        { label: tr('menu.selectAll'), role: 'selectAll' }
      ]
    },
    {
      label: tr('menu.view'),
      submenu: [
        { label: tr('menu.sidebar'), type: 'checkbox', checked: uiState.sidebar, enabled: c, ...shown('CmdOrCtrl+1'), click: () => send('toggle:sidebar') },
        { label: tr('menu.events'), type: 'checkbox', checked: uiState.events, enabled: c, ...shown('CmdOrCtrl+2'), click: () => send('toggle:events') },
        { label: tr('menu.timeline'), type: 'checkbox', checked: uiState.timeline, enabled: c, ...shown('CmdOrCtrl+3'), click: () => send('toggle:timeline') },
        { type: 'separator' },
        { label: tr('menu.liveVideo'), type: 'radio', checked: uiState.liveMode === 'webrtc', enabled: c, click: () => send('livemode', 'webrtc') },
        { label: tr('menu.liveImages'), type: 'radio', checked: uiState.liveMode === 'snapshot', enabled: c, click: () => send('livemode', 'snapshot') },
        { type: 'separator' },
        { label: tr('menu.stats'), type: 'checkbox', checked: uiState.stats, enabled: c, click: () => send('toggle:stats') },
        { label: tr('menu.wall'), type: 'checkbox', checked: uiState.expand, enabled: c, ...shown('CmdOrCtrl+E'), click: () => send('toggle:expand') },
        { label: tr('menu.fullscreen'), accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11', click: () => mainWin?.setFullScreen(!mainWin.isFullScreen()) },
        { type: 'separator' },
        { label: tr('menu.zoomIn'), role: 'zoomIn' },
        { label: tr('menu.zoomOut'), role: 'zoomOut' },
        { label: tr('menu.resetZoom'), role: 'resetZoom' },
        { type: 'separator' },
        { label: tr('menu.reload'), role: 'reload' },
        ...(app.isPackaged ? [] : [{ label: tr('menu.devtools'), role: 'toggleDevTools' }])
      ]
    },
    {
      label: tr('menu.layouts'),
      submenu: [
        ...(uiState.layouts.length
          ? uiState.layouts.map((l, i) => ({ label: l.name, type: 'radio', checked: l.id === uiState.activeLayout, accelerator: i < 9 ? `CmdOrCtrl+Alt+${i + 1}` : undefined, click: () => send('layout:apply', l.id) }))
          : [{ label: tr('menu.noLayout'), enabled: false }]),
        { type: 'separator' },
        { label: tr('menu.prevLayout'), accelerator: 'CmdOrCtrl+Alt+Left', enabled: uiState.layouts.length > 1, click: () => send('layout:step', -1) },
        { label: tr('menu.nextLayout'), accelerator: 'CmdOrCtrl+Alt+Right', enabled: uiState.layouts.length > 1, click: () => send('layout:step', 1) },
        { type: 'separator' },
        { label: tr('menu.editLayout'), enabled: !!uiState.activeLayout, click: () => send('layout:edit') },
        { label: tr('menu.newLayout'), enabled: c, click: () => send('layout:new') },
        { label: tr('menu.autoLayout'), enabled: c, click: () => send('layout:auto') }
      ]
    },
    {
      label: tr('menu.playback'),
      submenu: [
        { label: uiState.live || uiState.playing ? tr('menu.pause') : tr('menu.play'), enabled: c, ...shown('Space'), click: () => send('play:toggle') },
        { type: 'separator' },
        { label: tr('menu.capture'), accelerator: 'CmdOrCtrl+Shift+S', enabled: c, click: () => send('media:capture') },
        { label: tr('menu.exportClip'), accelerator: 'CmdOrCtrl+Shift+E', enabled: c, click: () => send('media:export') },
        { label: tr('menu.sound'), accelerator: 'CmdOrCtrl+Shift+M', enabled: c, click: () => send('media:mute') },
        { type: 'separator' },
        { label: tr('menu.backToLive'), enabled: c && !uiState.live, ...shown('L'), click: () => send('play:live') },
        { type: 'separator' },
        { label: tr('menu.back10'), enabled: c, ...shown('Left'), click: () => send('play:skip', -10) },
        { label: tr('menu.fwd10'), enabled: c && !uiState.live, ...shown('Right'), click: () => send('play:skip', 10) },
        { label: tr('menu.back30'), enabled: c, ...shown('Shift+Left'), click: () => send('play:skip', -30) },
        { label: tr('menu.fwd30'), enabled: c && !uiState.live, ...shown('Shift+Right'), click: () => send('play:skip', 30) },
        { type: 'separator' },
        { label: tr('menu.faster'), enabled: c && !uiState.live, click: () => send('play:speed', 1) },
        { label: tr('menu.slower'), enabled: c && !uiState.live, click: () => send('play:speed', -1) },
        { type: 'separator' },
        { label: tr('menu.sync'), type: 'checkbox', checked: uiState.sync, enabled: c, click: () => send('play:sync') },
        { label: tr('menu.ago15'), enabled: c, click: () => send('play:ago', 15) },
        { label: tr('menu.ago60'), enabled: c, click: () => send('play:ago', 60) },
        { label: tr('menu.yesterday'), enabled: c, click: () => send('play:ago', 1440) }
      ]
    },
    {
      label: tr('menu.events'),
      submenu: [
        { label: tr('menu.faces'), accelerator: 'CmdOrCtrl+Shift+F', enabled: c, click: () => send('faces:open') },
        { label: tr('menu.plates'), accelerator: 'CmdOrCtrl+Shift+P', enabled: c, click: () => send('plates:open') },
        { type: 'separator' },
        { label: tr('menu.markAllSeen') + (uiState.unseen ? ` (${uiState.unseen})` : ''), enabled: c && uiState.unseen > 0, click: () => send('events:seen') },
        { type: 'separator' },
        { label: tr('menu.notifications'), type: 'checkbox', checked: settings.notify, click: (i) => { settings.notify = i.checked; saveSettings(); applySettings() } },
        { label: tr('menu.dnd'), type: 'checkbox', checked: settings.dnd, click: (i) => { settings.dnd = i.checked; saveSettings(); applySettings() } },
        { label: tr('menu.notifSettings'), click: () => send('settings', 'notif') }
      ]
    },
    {
      label: tr('menu.window'),
      submenu: [
        { label: tr('menu.walls'), click: () => send('settings', 'screens') },
        { label: tr('menu.identify'), click: identifyScreens },
        { type: 'separator' },
        { label: tr('menu.minimize'), role: 'minimize' },
        ...(isMac ? [{ role: 'zoom', label: tr('menu.zoom') }, { role: 'front', label: tr('menu.front') }] : [])
      ]
    },
    {
      label: tr('menu.help'),
      submenu: [
        { label: tr('menu.shortcuts'), accelerator: 'F1', click: () => send('help') },
        { label: tr('menu.checkUpdates'), enabled: app.isPackaged, click: () => checkUpdates() },
        { label: tr('menu.docs'), click: () => openExternal('https://docs.frigate.video') },
        { type: 'separator' },
        { label: tr('menu.dataFolder'), click: () => shell.openPath(app.getPath('userData')) },
        { label: tr('menu.about'), click: showAbout }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// Statistiques : processeur et mémoire de FrigateView (tous ses processus) et du PC
let lastCpu = null
function systemCpu() {
  const t = os.cpus().reduce((a, c) => { const v = c.times; a.idle += v.idle; a.total += v.user + v.nice + v.sys + v.irq + v.idle; return a }, { idle: 0, total: 0 })
  const prev = lastCpu
  lastCpu = t
  return prev && t.total > prev.total ? 100 * (1 - (t.idle - prev.idle) / (t.total - prev.total)) : null
}
ipcMain.handle('metrics:get', () => {
  const procs = app.getAppMetrics()
  return {
    appCpu: procs.reduce((a, p) => a + (p.cpu?.percentCPUUsage || 0), 0) / os.cpus().length, // % de la capacité totale du PC
    appMem: procs.reduce((a, p) => a + (p.memory?.workingSetSize || 0), 0) * 1024, // octets
    sysCpu: systemCpu(),
    sysMemUsed: os.totalmem() - os.freemem(),
    sysMemTotal: os.totalmem(),
    gpu: procs.some((p) => p.type === 'GPU')
  }
})

ipcMain.handle('app:focused', () => !!mainWin && mainWin.isVisible() && mainWin.isFocused())

/* ------------------------------------------------------------------
   Zone de notification
   ------------------------------------------------------------------ */
let trayStatus = ''
ipcMain.handle('tray:status', (_e, text) => { trayStatus = text; refreshTray(); return true })

function refreshTray() {
  if (!tray) return
  tray.setToolTip(`FrigateView${trayStatus ? ' — ' + trayStatus : ''}`)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `FrigateView${trayStatus ? ' · ' + trayStatus : ''}`, enabled: false },
    { type: 'separator' },
    { label: tr('menu.show'), click: showMain },
    { label: tr('menu.dnd'), type: 'checkbox', checked: settings.dnd, click: (i) => { settings.dnd = i.checked; saveSettings(); applySettings() } },
    { label: tr('menu.settings'), click: () => { showMain(); mainWin?.webContents.send('settings:open') } },
    { type: 'separator' },
    { label: tr('menu.quit'), click: () => { quitting = true; app.quit() } }
  ]))
}
function createTray() {
  const img = appIcon()
  if (img.isEmpty()) return
  tray = new Tray(img.resize({ width: 16, height: 16 }))
  tray.on('click', showMain)
  refreshTray()
}

/* ------------------------------------------------------------------
   Démarrage
   ------------------------------------------------------------------ */
// Tests automatiques : profil séparé (ne touche ni aux réglages ni à la session de l'utilisateur)
if (process.env.FV_SMOKE_PROFILE) app.setPath('userData', process.env.FV_SMOKE_PROFILE)

// Une seule instance : relancer l'application ramène la fenêtre existante
if (!process.env.FV_SMOKE_PROFILE && !app.requestSingleInstanceLock()) app.quit()
else app.on('second-instance', showMain)

app.on('before-quit', () => { quitting = true })

app.whenReady().then(() => {
  app.setAppUserModelId('fr.idsynergy.frigateview') // nécessaire aux notifications Windows
  settings = { ...DEFAULTS, ...readJson('settings.json', {}) }
  trusted = readJson('trusted-certs.json', {})
  installCertCheck()
  // Les <img> de la fenêtre (page locale) vers Frigate sont des requêtes « inter-sites » :
  // le cookie de session (SameSite=Lax) n'y est pas joint. On l'ajoute ici, uniquement
  // pour l'hôte visé par la requête.
  const frigateUrls = ['https://*/api/*', 'https://*/vod/*', 'https://*/clips/*', 'wss://*/ws', 'http://*/api/*', 'http://*/vod/*', 'http://*/clips/*', 'ws://*/ws']
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: frigateUrls }, async (details, done) => {
    const headers = details.requestHeaders
    if (!headers.Cookie && details.webContentsId) {
      const cookies = await session.defaultSession.cookies.get({ url: details.url })
      if (cookies.length) headers.Cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    }
    done({ requestHeaders: headers })
  })
  // La relecture (hls.js) lit les listes et segments vidéo par XHR : Frigate n'envoie pas
  // d'en-têtes CORS, on autorise donc la fenêtre de l'application à lire ces réponses.
  session.defaultSession.webRequest.onHeadersReceived({ urls: frigateUrls }, (details, done) => {
    if (!details.webContentsId) return done({})
    const headers = Object.fromEntries(Object.entries(details.responseHeaders || {}).filter(([k]) => k.toLowerCase() !== 'access-control-allow-origin'))
    headers['Access-Control-Allow-Origin'] = ['*']
    headers['Timing-Allow-Origin'] = ['*'] // permet de mesurer la taille des images reçues (statistiques de débit)
    done({ responseHeaders: headers })
  })
  createTray()
  buildMenu()
  createWindow()
  syncWalls()
  screen.on('display-added', syncWalls)
  screen.on('display-removed', syncWalls)
  applySettings()
  checkUpdates = initUpdater({ tr, win: () => mainWin })
  app.on('activate', showMain)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !tray) app.quit()
})

/* ------------------------------------------------------------------
   Test rapide (développement) : FV_SMOKE=/chemin/capture.png
   Optionnel : FV_SMOKE_JS = script exécuté dans la fenêtre avant capture.
   ------------------------------------------------------------------ */
// À propos : version, licence et mention d'origine (exigée par ADDITIONAL_TERMS.md)
const REPO = 'https://github.com/dimer47/FrigateView'
async function showAbout() {
  const detail = `${tr('main.aboutText')}\n${uiState.version ? `${tr('main.aboutServer', { version: uiState.version })}\n` : ''}Electron ${process.versions.electron} · Chromium ${process.versions.chrome}\n\n${tr('main.aboutLicense')}\n${tr('main.aboutOrigin', { url: REPO })}`
  const { response } = await dialog.showMessageBox(mainWin, { type: 'info', title: tr('menu.about'), message: `FrigateView ${app.getVersion()}`, detail, icon: appIcon(), buttons: [tr('common.close'), tr('main.aboutLicenses')], defaultId: 0, cancelId: 0 })
  if (response === 1) openExternal(`${REPO}/blob/main/THIRD_PARTY_NOTICES.md`)
}

function smokeTest(win, out) {
  if (process.env.FV_DEBUG) win.webContents.on('console-message', (e) => console.log('[page]', e.message))
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      if (process.env.FV_SMOKE_JS) await win.webContents.executeJavaScript(process.env.FV_SMOKE_JS)
      setTimeout(async () => {
        writeFileSync(out, (await win.webContents.capturePage()).toPNG())
        for (const [id, w] of walls) if (!w.isDestroyed()) writeFileSync(out.replace(/\.png$/, `-mur${id}.png`), (await w.webContents.capturePage()).toPNG())
        app.quit()
      }, Number(process.env.FV_SMOKE_WAIT || 4000))
    }, 500)
  })
}
