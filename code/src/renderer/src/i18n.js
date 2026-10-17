import { createI18n } from 'vue-i18n'
import { LANGS, langInfo } from '../../shared/langs'

// Toutes les langues sont chargées d'emblée (quelques dizaines de Ko)
const files = import.meta.glob('../../shared/locales/*.json', { eager: true, import: 'default' })
const messages = Object.fromEntries(Object.entries(files).map(([p, m]) => [p.match(/(\w+)\.json$/)[1], m]))

export { LANGS }
export const i18n = createI18n({
  legacy: false,
  locale: 'fr',
  fallbackLocale: ['en', 'fr'], // clé absente d'une traduction : anglais, puis français (langue source)
  messages,
  missingWarn: false,
  fallbackWarn: false
})

export const t = (...a) => i18n.global.t(...a)
export const loc = () => langInfo(i18n.global.locale.value).bcp47

export function setLocale(code) {
  i18n.global.locale.value = code
  document.documentElement.lang = code
  document.documentElement.dir = langInfo(code).dir || 'ltr'
}

export const fmtDuration = (s) => (s >= 60 ? t('fmt.minSec', { m: Math.floor(s / 60), s: String(s % 60).padStart(2, '0') }) : t('fmt.sec', { s }))

export function dayTitle(ts) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(ts); d.setHours(0, 0, 0, 0)
  const diff = Math.round((today - d) / 864e5)
  return diff === 0 ? t('fmt.today') : diff === 1 ? t('fmt.yesterday') : new Date(ts).toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })
}
