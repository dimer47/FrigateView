// macOS sans certificat Apple : signature « ad hoc » de toute l'application
// (sans elle, macOS sur puce Apple considère l'app comme endommagée).
// N'utilise aucune clé du trousseau.
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'darwin') return
  const app = join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
}
