import { describe, it, expect, vi } from 'vitest'
vi.mock('@/i18n', () => ({ t: (k) => k }))
import * as f from '@/services/frigate'

const secure = { host: 'nvr', port: 8971 }
const local = { host: 'nvr', port: 5000, mode: 'local' }

describe('isInternal / baseUrl', () => {
  it('mode explicite prioritaire, sinon port 5000', () => {
    expect(f.isInternal({ port: 5000 })).toBe(true)
    expect(f.isInternal({ port: '5000' })).toBe(true)
    expect(f.isInternal({ port: 5000, mode: 'account' })).toBe(false)
    expect(f.isInternal({ port: 8080, mode: 'local' })).toBe(true)
    expect(f.isInternal(secure)).toBe(false)
  })
  it('baseUrl', () => {
    expect(f.baseUrl(secure)).toBe('https://nvr:8971')
    expect(f.baseUrl(local)).toBe('http://nvr:5000')
  })
})

describe('URLs', () => {
  it('vod / clip / recordings arrondis et encodage', () => {
    expect(f.vodUrl(secure, 'a b', 10.7, 20.2)).toBe('https://nvr:8971/vod/a%20b/start/10/end/21/index.m3u8')
    expect(f.clipUrl(local, 'cam', 1.5, 2.5)).toBe('http://nvr:5000/api/cam/start/1/end/3/clip.mp4')
    expect(f.recordingFrameUrl(secure, 'cam', 99.9)).toBe('https://nvr:8971/api/cam/recordings/99/snapshot.jpg')
    expect(f.recordingFrameUrl(secure, 'cam', 99.9, 180)).toBe('https://nvr:8971/api/cam/recordings/99/snapshot.jpg?height=180')
  })
  it('snapshot / latest avec anti-cache', () => {
    expect(f.snapshotUrl(secure, 'cam', 360)).toMatch(/^https:\/\/nvr:8971\/api\/cam\/latest\.webp\?height=360&t=\d+$/)
    expect(f.latestJpgUrl(secure, 'cam')).toMatch(/^https:\/\/nvr:8971\/api\/cam\/latest\.jpg\?t=\d+$/)
  })
  it('thumbUrl', () => {
    expect(f.thumbUrl(secure, { thumb_path: '/media/frigate/clips/review/x.webp' })).toBe('https://nvr:8971/clips/review/x.webp')
    expect(f.thumbUrl(secure, {})).toBe('')
  })
  it('wsUrl', () => {
    expect(f.wsUrl(secure)).toBe('wss://nvr:8971/ws')
    expect(f.wsUrl(local)).toBe('ws://nvr:5000/ws')
  })
  it('onlineFromStats', () => {
    expect(f.onlineFromStats({ cameras: { a: { camera_fps: 5 }, b: { camera_fps: 0 }, c: {} } })).toEqual({ a: true, b: false, c: false })
    expect(f.onlineFromStats({})).toEqual({})
  })
})

describe('request (window.native mocké)', () => {
  it('ajoute X-CSRF-TOKEN sur POST et mappe les erreurs', async () => {
    const http = vi.fn().mockResolvedValue({ ok: true, text: '' })
    globalThis.window = { native: { http } }
    await f.markReviewed(secure, ['1'])
    expect(http.mock.calls[0][0].headers['X-CSRF-TOKEN']).toBe('1')
    expect(http.mock.calls[0][0].url).toBe('https://nvr:8971/api/reviews/viewed')
    http.mockResolvedValueOnce({ ok: false, status: 401 })
    await expect(f.getJson(secure, '/api/x')).rejects.toMatchObject({ code: 'auth' })
    http.mockResolvedValueOnce({ ok: false, error: 'timeout' })
    await expect(f.getJson(secure, '/api/x')).rejects.toMatchObject({ code: 'timeout' })
    delete globalThis.window
  })
})
