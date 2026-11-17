export type LyricLine = { text: string; start: number; end: number }
export type SyncedLyrics = { id: number; lines: LyricLine[] }
export type LyricsRecord = {
    id?: number
    trackName?: string
    artistName?: string
    albumName?: string
    duration?: number
    instrumental?: boolean
    hasWordSync?: boolean
    syncedLyrics?: string | null
}

const time = (minutes: string, seconds: string) => Number(minutes) * 60000 + Number(seconds) * 1000

export function parseLyrics(record: LyricsRecord, duration: number): SyncedLyrics | null {
    if (record.instrumental || record.hasWordSync || typeof record.syncedLyrics !== 'string' || record.syncedLyrics.length >= 1000000) return null
    // Enhanced LRC also contains word timings: accept ordinary line timestamps only.
    if (/<\d{1,3}:\d{2}(?:\.\d{1,3})?>/.test(record.syncedLyrics)) return null
    const lines: LyricLine[] = []
    const offset = Number(record.syncedLyrics.match(/\[offset:([+-]?\d+)\]/i)?.[1] ?? 0)
    for (const raw of record.syncedLyrics.split(/\r?\n/).slice(0, 2000)) {
        const stamps = [...raw.matchAll(/\[(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)\]/g)]
        if (!stamps.length) continue
        const last = stamps.at(-1)!
        const text = raw.slice((last.index ?? 0) + last[0].length).trim()
        for (const stamp of stamps) {
            const start = Math.max(0, time(stamp[1], stamp[2]) + offset)
            if (Number.isFinite(start) && start < duration) lines.push({ text, start, end: duration })
        }
    }
    lines.sort((a, b) => a.start - b.start)
    lines.forEach((line, index) => { line.end = lines[index + 1]?.start ?? duration })
    const valid = lines.filter(line => line.end > line.start)
    return valid.some(line => line.text.trim()) ? { id: Number(record.id) || 0, lines: valid } : null
}

export function introCountdown(lines: LyricLine[], position: number) {
    const first = lines.find(line => line.text.trim())
    const remaining = first ? first.start - position : 0
    return remaining > 0 && remaining <= 3000 ? Math.ceil(remaining / 1000) : 0
}

export function activeLine(lines: LyricLine[], position: number) {
    let low = 0, high = lines.length - 1, result = -1
    while (low <= high) {
        const middle = (low + high) >> 1
        if (lines[middle].start <= position) { result = middle; low = middle + 1 }
        else high = middle - 1
    }
    return result >= 0 && position < lines[result].end ? result : -1
}

export const normalizeTitle = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '')
