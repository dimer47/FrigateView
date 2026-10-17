// Mise à jour automatique depuis les releases GitHub.
// Windows : téléchargement en arrière-plan, installation au redémarrage.
// macOS : l'app n'a pas de certificat Apple, la mise à jour en place est impossible ;
// on signale la nouvelle version et on ouvre la page de téléchargement.
import { app, dialog, shell } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater
const RELEASES = 'https://github.com/dimer47/FrigateView/releases/latest'
const SIX_HOURS = 6 * 3600e3

export function initUpdater({ tr, win }) {
  if (!app.isPackaged) return () => {}
  const mac = process.platform === 'darwin'
  autoUpdater.autoDownload = !mac
  autoUpdater.autoInstallOnAppQuit = true
  let manual = false // vérification demandée depuis le menu : on répond même si rien de neuf

  autoUpdater.on('update-available', async (info) => {
    if (!mac) return
    const r = await dialog.showMessageBox(win(), { type: 'info', message: tr('main.updateAvailable', { version: info.version }), detail: tr('main.updateMacHint'), buttons: [tr('main.updateDownload'), tr('main.updateLater')], defaultId: 0, cancelId: 1 })
    if (r.response === 0 && /^https:\/\//.test(RELEASES)) shell.openExternal(RELEASES)
  })
  autoUpdater.on('update-downloaded', async (info) => {
    const r = await dialog.showMessageBox(win(), { type: 'info', message: tr('main.updateReady', { version: info.version }), buttons: [tr('main.updateRestart'), tr('main.updateLater')], defaultId: 0, cancelId: 1 })
    if (r.response === 0) setImmediate(() => autoUpdater.quitAndInstall())
  })
  autoUpdater.on('update-not-available', () => {
    if (manual) dialog.showMessageBox(win(), { type: 'info', message: tr('main.upToDate', { version: app.getVersion() }) })
    manual = false
  })
  autoUpdater.on('error', (e) => {
    if (manual) dialog.showMessageBox(win(), { type: 'warning', message: tr('main.updateError'), detail: String(e?.message || e) })
    manual = false
  })

  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  setTimeout(check, 15e3)
  setInterval(check, SIX_HOURS)
  return () => { manual = true; check() }
}
