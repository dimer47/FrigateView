// Fuses Electron + signature « ad hoc » macOS (sans certificat Apple ; aucune clé du trousseau).
// electron-builder bascule ses fuses (option electronFuses) APRÈS afterPack : la signature ad hoc
// faite ici serait alors invalidée. On les bascule donc ici, puis on signe.
// Ne pas renseigner build.electronFuses dans package.json (double bascule après la signature).
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function (ctx) {
  const { FuseVersion, FuseV1Options } = await import('@electron/fuses')
  await ctx.packager.addElectronFuses(ctx, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    // Intégrité de l'asar : empreinte écrite dans Info.plist / ressources Windows avant afterPack,
    // la signature ad hoc ne touche pas à app.asar → compatible
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true
  })
  if (ctx.electronPlatformName !== 'darwin') return
  const app = join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
}
