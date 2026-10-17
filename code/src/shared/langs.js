// Les 10 langues les plus parlées au monde (locuteurs natifs + seconde langue)
export const LANGS = [
  { code: 'en', name: 'English', bcp47: 'en-GB' },
  { code: 'zh', name: '中文（简体）', bcp47: 'zh-CN' },
  { code: 'hi', name: 'हिन्दी', bcp47: 'hi-IN' },
  { code: 'es', name: 'Español', bcp47: 'es-ES' },
  { code: 'ar', name: 'العربية', bcp47: 'ar', dir: 'rtl' },
  { code: 'fr', name: 'Français', bcp47: 'fr-FR' },
  { code: 'bn', name: 'বাংলা', bcp47: 'bn-BD' },
  { code: 'pt', name: 'Português', bcp47: 'pt-BR' },
  { code: 'ru', name: 'Русский', bcp47: 'ru-RU' },
  { code: 'id', name: 'Bahasa Indonesia', bcp47: 'id-ID' }
]

// Choix explicite, sinon langue du système si elle est disponible, sinon anglais
export function resolveLang(pref, system) {
  if (pref && LANGS.some((l) => l.code === pref)) return pref
  const base = String(system || '').toLowerCase().split(/[-_]/)[0]
  return LANGS.some((l) => l.code === base) ? base : 'en'
}

export const langInfo = (code) => LANGS.find((l) => l.code === code) || LANGS[0]

// Lecture d'une clé « a.b.c » avec remplacement des {variables} (processus principal)
export function translate(messages, key, vars = {}) {
  const v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), messages)
  if (typeof v !== 'string') return null
  return v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`))
}
