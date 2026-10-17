// Relecture d'un événement : 5 s avant son début, sur la case de sa caméra (panneau des événements, galerie des visages)
import { t } from '@/i18n'
import { useEventsStore } from './events'
import { useLayoutStore } from './layouts'
import { useServerStore } from './server'
import { useTimelineStore } from './timeline'
import { useUiStore } from './ui'

export function playEvent(e) {
  const ev = useEventsStore(), layouts = useLayoutStore(), server = useServerStore(), tl = useTimelineStore(), ui = useUiStore()
  const camName = server.camById(e.cam)?.name || e.cam
  ev.activeId = e.id
  ev.markSeen([e.id])
  const i = layouts.active?.cells.indexOf(e.cam) ?? -1
  if (i >= 0) layouts.selected = i
  else if (layouts.active) ui.notify(t('events.notInLayout', { cam: camName }), { label: t('events.addIt'), run: () => { const empty = layouts.active.cells.indexOf(null); layouts.place(e.cam, empty >= 0 ? empty : layouts.selected) } })
  tl.seek(e.s - 5000, e.cam, true)
}
