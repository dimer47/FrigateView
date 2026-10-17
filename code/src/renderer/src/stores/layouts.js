import { defineStore } from 'pinia'
import { load, save } from './storage'

// Grilles : colonnes × lignes, plus des cases agrandies [colonne, ligne, largeur, hauteur]
// (numérotées à partir de 1). Les autres cases se placent automatiquement dans l'ordre.
const G = (label, cols, rows, big = [], group = '') => {
  const n = cols * rows - big.reduce((a, [, , w, h]) => a + w * h - 1, 0)
  return { label, cols, rows, big, n, group }
}
export const GRIDS = {
  '1x1': G('1', 1, 1, [], 'small'),
  '1x2': G('2×1', 2, 1, [], 'small'),
  '2x1': G('1×2', 1, 2, [], 'small'),
  '1p2': G('1+2', 3, 2, [[1, 1, 2, 2]], 'small'),
  '1p3': G('1+3', 3, 3, [[1, 1, 3, 2]], 'small'),
  '2x2': G('2×2', 2, 2, [], 'small'),
  '3x2': G('3×2', 3, 2, [], 'medium'),
  '1p5': G('1+5', 3, 3, [[1, 1, 2, 2]], 'medium'),
  '2p4': G('2+4', 4, 3, [[1, 1, 2, 2], [3, 1, 2, 2]], 'medium'),
  '1p7': G('1+7', 4, 4, [[1, 1, 3, 3]], 'medium'),

  '3x3': G('3×3', 3, 3, [], 'medium'),
  '2p8': G('2+8', 4, 4, [[1, 1, 2, 2], [3, 1, 2, 2]], 'large'),
  '1p12': G('1+12', 4, 4, [[2, 2, 2, 2]], 'large'),
  '4x3': G('4×3', 4, 3, [], 'large'),
  '4x4': G('4×4', 4, 4, [], 'large'),
  '5x4': G('5×4', 5, 4, [], 'large'),
  '5x5': G('5×5', 5, 5, [], 'large'),
  '6x6': G('6×6', 6, 6, [], 'large')
}
// Style CSS de la grille et de la n-ième case
export function gridStyle(key) {
  const g = GRIDS[key] || GRIDS['2x2']
  return { gridTemplateColumns: `repeat(${g.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${g.rows}, minmax(0, 1fr))` }
}
export function cellStyle(key, i) {
  const b = (GRIDS[key] || GRIDS['2x2']).big[i]
  return b ? { gridColumn: `${b[0]} / span ${b[2]}`, gridRow: `${b[1]} / span ${b[3]}` } : null
}

export const bestGrid = (n) => (n <= 1 ? '1x1' : n <= 2 ? '1x2' : n <= 4 ? '2x2' : n <= 6 ? '1p5' : n <= 9 ? '3x3' : n <= 12 ? '4x3' : n <= 16 ? '4x4' : n <= 20 ? '5x4' : n <= 25 ? '5x5' : '6x6')

export const useLayoutStore = defineStore('layouts', {
  state: () => ({
    layouts: load('fv-layouts', []),
    activeId: load('fv-active', null),
    selected: 0, // case sélectionnée
    focus: null // case agrandie (double-clic)
  }),
  getters: {
    active: (s) => s.layouts.find((l) => l.id === s.activeId) || null,
    cams() { return [...new Set((this.active?.cells || []).filter(Boolean))] }
  },
  actions: {
    persist() { save('fv-layouts', this.layouts); save('fv-active', this.activeId) },
    apply(id) { this.activeId = id; this.selected = 0; this.focus = null; this.persist() },
    create(name, grid, cells = []) {
      const l = { id: 'l' + Date.now(), name, grid, cells: Array.from({ length: GRIDS[grid].n }, (_, i) => cells[i] || null) }
      this.layouts.push(l)
      this.apply(l.id)
      return l
    },
    update(id, name, grid) {
      const l = this.layouts.find((x) => x.id === id)
      l.name = name
      l.grid = grid
      l.cells = Array.from({ length: GRIDS[grid].n }, (_, i) => l.cells[i] || null)
      this.focus = null
      this.persist()
    },
    remove(id) {
      const i = this.layouts.findIndex((x) => x.id === id)
      const [removed] = this.layouts.splice(i, 1)
      if (this.activeId === id) this.activeId = this.layouts[Math.max(0, i - 1)]?.id || null
      this.persist()
      return { removed, index: i }
    },
    restore({ removed, index }) { this.layouts.splice(index, 0, removed); this.apply(removed.id) },
    move(fromId, toId) {
      const from = this.layouts.findIndex((l) => l.id === fromId)
      const [m] = this.layouts.splice(from, 1)
      const to = this.layouts.findIndex((l) => l.id === toId)
      this.layouts.splice(to + (from <= to ? 1 : 0), 0, m)
      this.persist()
    },
    // Place une caméra ; si elle est déjà dans le layout, les deux cases sont échangées
    place(camId, idx) {
      const cells = this.active.cells
      const prev = cells.indexOf(camId)
      if (prev === idx) return
      if (prev >= 0) cells[prev] = cells[idx]
      cells[idx] = camId
      this.selected = idx
      this.persist()
    },
    swap(a, b) { const c = this.active.cells; [c[a], c[b]] = [c[b], c[a]]; this.selected = b; this.persist() },
    clearCell(idx) { const id = this.active.cells[idx]; this.active.cells[idx] = null; this.persist(); return id },
    // Retire d'un layout les caméras qui n'existent plus sur le serveur
    prune(ids) {
      const known = new Set(ids)
      for (const l of this.layouts) l.cells = l.cells.map((c) => (c && known.has(c) ? c : null))
      this.persist()
    }
  }
})
