import type { AddonApi } from '@pulsesync/addon-sdk'
import { normalizeTitle, parseLyrics, type LyricsRecord, type SyncedLyrics } from './lyrics-data'

export type TrackSignature = { title: string; artist: string; artists: string[]; album: string; duration: number }
type CacheEntry = { value: SyncedLyrics | null; until: number }

// Remove only soundtrack credits; live, remix and other recording versions stay intact.
export function withoutFilmCredit(title: string) {
    return title.replace(/\s*(?:[-–—]\s*)?(?:\(\s*)?(?:из\s+(?:(?:кино)?фильма|сериала|мультфильма)|from\s+(?:(?:the|a)\s+)?(?:film|movie|series|motion\s+picture))\s+(?:«[^»]+»|“[^”]+”|"[^"]+"|[^()]+)\s*\)?\s*$/iu, '').trim() || title
}

export function createLyricsSource(api: AddonApi) {
    const cache = new Map<string, CacheEntry>()
    let nextRequest = 0
    const headers = { 'X-User-Agent': 'MinimalisticWaveTab/2.0.1 (https://github.com/dieughh/MinimalisticWaveTab)' }

    async function request(path: string, signal: AbortSignal) {
        const delay = nextRequest - Date.now()
        if (delay > 0) await new Promise<void>((resolve, reject) => {
            const cancel = api.setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, delay)
            const abort = () => { cancel(); reject(new DOMException('Aborted', 'AbortError')) }
            signal.addEventListener('abort', abort, { once: true })
            if (signal.aborted) abort()
        })
        signal.throwIfAborted()
        nextRequest = Date.now() + 300
        const response = await api.net.fetch('https://lrclib.net/api/' + path, { signal, headers, timeoutMs: 10000 })
        if (response.status === 429 || response.status === 503) {
            const seconds = Number(response.headers.get('Retry-After')) || 60
            nextRequest = Date.now() + Math.max(1000, seconds * 1000) * (1 + Math.random() * 0.2)
            throw new Error('LRCLIB temporarily unavailable; Retry-After respected')
        }
        if (response.status >= 500) throw new Error('LRCLIB temporarily unavailable')
        if (!response.ok) return null
        const raw = await response.text()
        if (raw.length > 2000000) return null
        return JSON.parse(raw) as unknown
    }

    function matches(record: LyricsRecord, track: TrackSignature) {
        const artistWords = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
        const credited = ' ' + artistWords(record.artistName ?? '') + ' '
        return normalizeTitle(record.trackName ?? '') === normalizeTitle(track.title) &&
            !!record.artistName && track.artists.some(artist => !!artistWords(artist) && credited.includes(' ' + artistWords(artist) + ' ')) &&
            typeof record.duration === 'number' && Math.abs(record.duration * 1000 - track.duration) <= 2100
    }

    async function load(track: TrackSignature, signal: AbortSignal): Promise<SyncedLyrics | null> {
        const key = JSON.stringify(track)
        const hit = cache.get(key)
        if (hit && hit.until > Date.now()) return hit.value
        // Never queue requests behind a server rate limit while tracks are skipped.
        if (nextRequest - Date.now() > 1000) return null
        let value: SyncedLyrics | null = null
        const titles = [...new Set([track.title, withoutFilmCredit(track.title)])]
        for (const title of titles) {
            const lookup = { ...track, title }
            const params = new URLSearchParams({ track_name: title, artist_name: track.artist, duration: String(Math.round(track.duration / 1000)) })
            if (title === track.title && track.album) params.set('album_name', track.album)
            const exact = await request('get?' + params, signal)
            signal.throwIfAborted()
            if (exact && typeof exact === 'object' && !Array.isArray(exact) && matches(exact as LyricsRecord, lookup)) value = parseLyrics(exact as LyricsRecord, track.duration)
            if (value) break
            if (nextRequest - Date.now() > 1000) break
            const search = new URLSearchParams({ track_name: title, artist_name: track.artist })
            try {
                const results = await request('search?' + search, signal)
                signal.throwIfAborted()
                if (Array.isArray(results)) {
                    const candidates = results.filter(record => record && matches(record, lookup)).sort((a, b) =>
                        Number(normalizeTitle(b.albumName ?? '') === normalizeTitle(track.album)) - Number(normalizeTitle(a.albumName ?? '') === normalizeTitle(track.album)))
                    for (const record of candidates) {
                        const parsed = parseLyrics(record, track.duration)
                        if (parsed) { value = parsed; break }
                    }
                }
            } catch (error) { signal.throwIfAborted(); if (!value) throw error }
            if (value) break
        }
        cache.set(key, { value, until: Date.now() + (value ? 86400000 : 600000) })
        if (cache.size > 100) cache.delete(cache.keys().next().value!)
        return value
    }

    return { load, clear: () => cache.clear() }
}
