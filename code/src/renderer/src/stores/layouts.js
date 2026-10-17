import { defineStore } from 'pinia'
import { load, save } from './storage'

export const GRIDS = {
  '1x1': { n: 1, label: '1×1' },
  '2x2': { n: 4, label: '2×2' },
  '3x3': { n: 9, label: '3×3' },
  '4x4': { n: 16, label: '4×4' },
  '1p5': { n: 6, label: '1+5' },
  '1p7': { n: 8, label: '1+7' }
}

export const bestGrid = (n) => (n <= 1 ? '1x1' : n <= 4 ? '2x2' : n <= 6 ? '1p5' : n <= 9 ? '3x3' : '4x4')

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
