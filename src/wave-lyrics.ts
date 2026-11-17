import type { AddonApi } from '@pulsesync/addon-sdk'
import { activeLine, introCountdown, type SyncedLyrics } from './lyrics-data'
import { createLyricsSource, type TrackSignature } from './lyrics-source'

type Snapshot = Awaited<ReturnType<AddonApi['player']['getSnapshot']>>

export function createWaveLyrics(api: AddonApi) {
    const source = createLyricsSource(api)
    let stopped = false, wanted = false, loading = false
    let root: HTMLElement | null = null, panel: HTMLDivElement | null = null, rail: HTMLDivElement | null = null
    let data: SyncedLyrics | null = null, rendered: SyncedLyrics | null = null
    let key = '', generation = 0, controller: AbortController | undefined
    let rows: HTMLButtonElement[] = []
    let countdown: HTMLSpanElement | null = null
    let currentLine = -2, scrollLine = 0, position = 0, sampledAt = 0, playing = false, duration = 0
    let frame = 0, lastTick = 0
    let scrollTarget = -1, manual = false, pointerHeld = false
    let cancelReturn: (() => void) | undefined
    let lastGeometry = ''
    let pendingSeek: { key: string; until: number } | null = null

    function stopScroll() {
        if (scrollTarget >= 0 && panel) panel.scrollTo({ top: panel.scrollTop, behavior: 'instant' })
        scrollTarget = -1
    }

    function resetBrowsing() {
        cancelReturn?.(); cancelReturn = undefined
        manual = false; pointerHeld = false
        if (panel) panel.dataset.follow = 'auto'
    }

    function scheduleReturn() {
        cancelReturn?.()
        cancelReturn = api.setTimeout(() => {
            cancelReturn = undefined
            if (stopped || !manual || !panel || panel.hidden) return
            if (pointerHeld) { scheduleReturn(); return }
            manual = false; panel.dataset.follow = 'auto'
            update(); center()
        }, 1500)
    }

    function browse() {
        if (!panel || panel.hidden) return
        stopScroll(); manual = true; panel.dataset.follow = 'manual'
        scheduleReturn()
    }

    function pointerEnd() {
        if (!pointerHeld) return
        pointerHeld = false
        if (manual) scheduleReturn()
    }
    window.addEventListener('pointerup', pointerEnd)
    window.addEventListener('pointercancel', pointerEnd)
    window.addEventListener('touchend', pointerEnd)
    window.addEventListener('touchcancel', pointerEnd)

    function syncButton() {
        if (!root) return
        const open = wanted && !!data
        if (open) root.setAttribute('data-mwt-lyrics', 'open')
        else root.removeAttribute('data-mwt-lyrics')
        if (panel) panel.hidden = !open
        for (const button of root.querySelectorAll<HTMLButtonElement>('[data-mwt-control="extra"]')) {
            button.disabled = !data
            button.setAttribute('aria-disabled', String(!data))
            button.setAttribute('aria-pressed', String(open))
            button.setAttribute('aria-label', open ? 'Скрыть текстомузыку' : 'Показать текстомузыку')
            button.title = loading ? 'Поиск синхронизированного текста в LRCLIB' : !data ? 'Синхронизированный текст в LRCLIB не найден' : open ? 'Скрыть текстомузыку' : 'Показать текстомузыку'
        }
        if (open) { render(); startClock() }
        else { cancelAnimationFrame(frame); frame = 0; resetBrowsing(); stopScroll() }
    }

    function now() {
        return Math.min(duration || Infinity, position + (playing ? performance.now() - sampledAt : 0))
    }

    function center(instant = false) {
        if (!panel || !rail || !rows.length || panel.hidden || manual) return
        const row = rows[Math.min(scrollLine, rows.length - 1)]
        const target = Math.max(0, Math.min(panel.scrollHeight - panel.clientHeight, row.offsetTop + row.offsetHeight / 2 - panel.clientHeight / 2))
        if (instant) {
            stopScroll(); panel.scrollTop = target; return
        }
        if (Math.abs(scrollTarget - target) < 0.5) return
        if (Math.abs(panel.scrollTop - target) < 0.5) { stopScroll(); return }
        scrollTarget = target
        // Chromium animates this scroll independently of JavaScript during player seeks.
        panel.scrollTo({ top: target, behavior: 'smooth' })
    }

    function update(instant = false) {
        if (!data || !rail || panel?.hidden) return
        const clock = now()
        const count = introCountdown(data.lines, clock)
        if (countdown) {
            countdown.hidden = !count
            countdown.textContent = count ? String(count) : ''
            countdown.parentElement?.toggleAttribute('data-countdown', !!count)
        }
        const index = activeLine(data.lines, clock)
        if (index !== currentLine || instant) {
            currentLine = index
            if (index >= 0) scrollLine = index
            else if (clock < (data.lines.find(line => line.text.trim())?.start ?? 0)) scrollLine = Math.max(0, data.lines.findIndex(line => line.text.trim()))
            rows.forEach((row, i) => {
                const distance = Math.abs(i - scrollLine)
                row.dataset.state = i === index ? 'active' : distance <= 1 ? 'near' : 'far'
                row.setAttribute('aria-current', String(i === index))
            })
            center(instant)
        }
    }

    function startClock() {
        if (frame || stopped || !wanted || !data || document.hidden) return
        const tick = (time: number) => {
            frame = 0
            if (stopped || !wanted || !data || document.hidden || !root?.isConnected) return
            if (time - lastTick >= 30) { lastTick = time; update() }
            if (playing) frame = requestAnimationFrame(tick)
        }
        update()
        if (playing) frame = requestAnimationFrame(tick)
    }

    function render() {
        if (!panel || !rail || !data || rendered === data) return
        resetBrowsing(); stopScroll()
        rendered = data
        rows = []; countdown = null; currentLine = -2; scrollLine = 0
        const fragment = document.createDocumentFragment()
        data.lines.forEach((line, index) => {
            const row = document.createElement('button')
            row.type = 'button'; row.className = 'ps-mwt-lyric-line'
            row.dataset.line = String(index)
            const inner = document.createElement('span')
            inner.className = 'ps-mwt-lyric-text'
            inner.textContent = line.text
            row.append(inner)
            if (!countdown && line.text.trim()) {
                countdown = document.createElement('span')
                countdown.className = 'ps-mwt-lyrics-countdown'; countdown.hidden = true
                countdown.setAttribute('aria-hidden', 'true')
                row.append(countdown)
            }
            if (!line.text.trim()) { row.classList.add('ps-mwt-lyric-gap'); row.tabIndex = -1 }
            row.addEventListener('pointerdown', event => {
                if (event.pointerType === 'touch') return
                event.preventDefault()
                row.focus({ preventScroll: true })
            })
            row.addEventListener('click', () => {
                if (stopped) return
                resetBrowsing()
                const request = { key, until: performance.now() + 1500 }
                pendingSeek = request
                position = line.start; sampledAt = performance.now(); update(); center()
                void Promise.resolve(api.client.setProgress(line.start / 1000)).catch(() => {
                    if (stopped || pendingSeek !== request) return
                    pendingSeek = null
                    void api.player.getSnapshot().then(snapshot).catch(() => {})
                })
            })
            rows.push(row); fragment.append(row)
        })
        rail.replaceChildren(fragment)
        update(true)
    }

    function layout(nextRoot: HTMLElement) {
        refresh(nextRoot)
        if (!panel || !root) return
        const meta = root.querySelector<HTMLElement>('[class*="VibePage_meta"]')
        const button = root.querySelector<HTMLElement>('#ps-custom-settings-btn')
        const player = root.querySelector<HTMLElement>('[class*="VibePage_playerBlock"]')
        if (!meta || !button || !player) return
        const origin = meta.getBoundingClientRect()
        panel.style.top = Math.max(0, button.getBoundingClientRect().bottom - origin.top + 12) + 'px'
        const progress = root.querySelector<HTMLElement>('[class*="VibePlayerBar_progress"]')
        const playerTop = progress?.getBoundingClientRect().top || player.getBoundingClientRect().top
        panel.style.bottom = Math.max(0, origin.bottom - playerTop + 12) + 'px'
        const geometry = `${panel.clientWidth}:${panel.clientHeight}`
        panel.style.setProperty('--ps-lyrics-edge-padding', panel.clientHeight / 2 + 'px')
        if (!panel.hidden) {
            update()
            if (geometry !== lastGeometry) { lastGeometry = geometry; center(true) }
        }
    }

    const resize = new ResizeObserver(() => {
        if (panel && !panel.hidden) {
            panel.style.setProperty('--ps-lyrics-edge-padding', panel.clientHeight / 2 + 'px')
            lastGeometry = `${panel.clientWidth}:${panel.clientHeight}`
            center(true)
        }
    })

    function refresh(nextRoot: HTMLElement) {
        if (stopped) return
        if (root !== nextRoot || !panel?.isConnected) {
            root?.removeAttribute('data-mwt-lyrics')
            resetBrowsing(); stopScroll(); lastGeometry = ''
            panel?.remove(); resize.disconnect()
            root = nextRoot
            const meta = root.querySelector<HTMLElement>('[class*="VibePage_meta"]')
            if (meta) {
                panel = document.createElement('div'); panel.className = 'ps-mwt-lyrics'; panel.hidden = true
                panel.tabIndex = 0; panel.dataset.follow = 'auto'
                panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Синхронизированный текст песни')
                panel.addEventListener('wheel', browse, { passive: true })
                panel.addEventListener('touchstart', () => { pointerHeld = true; browse() }, { passive: true })
                panel.addEventListener('touchmove', browse, { passive: true })
                panel.addEventListener('pointerdown', () => { pointerHeld = true; browse() })
                panel.addEventListener('scroll', () => { if (manual) scheduleReturn() }, { passive: true })
                panel.addEventListener('keydown', event => {
                    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab'].includes(event.key)) browse()
                })
                rail = document.createElement('div'); rail.className = 'ps-mwt-lyrics-rail'
                panel.append(rail); meta.append(panel); resize.observe(panel)
                rendered = null
            }
        }
        syncButton()
    }

    async function snapshot(value: Snapshot) {
        if (stopped) return
        const track = value.track
        const progress = typeof value.progress === 'number' ? value.progress : value.progress?.position ?? 0
        const nextDuration = Number(track?.durationMs) || (value.duration ?? (typeof value.progress === 'object' ? value.progress?.duration : null) ?? 0) * 1000
        const artists = track?.artists?.map(artist => artist.name ?? '').filter(Boolean) ?? []
        const signature: TrackSignature = { title: String(track?.title ?? '') + (track?.version ? ` (${track.version})` : ''), artist: artists[0] ?? '', artists, album: track?.albums?.[0]?.title ?? '', duration: nextDuration }
        const nextKey = track ? JSON.stringify([track.id, signature]) : ''
        // Ignore snapshots still carrying the old position until the clicked seek arrives.
        if (pendingSeek && pendingSeek.key === nextKey && performance.now() < pendingSeek.until && Math.abs(now() - progress * 1000) > 750) return
        pendingSeek = null
        position = progress * 1000; sampledAt = performance.now(); playing = value.isPlaying
        duration = nextDuration
        if (nextKey !== key) {
            key = nextKey; const request = ++generation
            controller?.abort(); controller = new AbortController()
            data = null; rendered = null; loading = !!track; currentLine = -2
            syncButton()
            if (!track || !signature.title || !signature.artist || !Number.isFinite(duration) || duration <= 0) { loading = false; syncButton(); return }
            try {
                const result = await source.load(signature, controller.signal)
                if (stopped || request !== generation) return
                data = result
            } catch (error) {
                if (stopped || request !== generation) return
                if (!(error instanceof DOMException && error.name === 'AbortError')) api.logger?.warn('LRCLIB: не удалось загрузить синхронизированный текст', error)
            }
            loading = false; syncButton(); if (wanted && data) { render(); update(true) }
        } else { update(); startClock() }
    }

    let unsubscribe: (() => void) | undefined
    if (typeof api.player?.onChange === 'function' && typeof api.net?.fetch === 'function') {
        unsubscribe = api.player.onChange(value => { void snapshot(value) })
        void api.player.getSnapshot().then(value => { if (!key) void snapshot(value) }).catch(() => {})
    }
    const visibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0 } else startClock() }
    document.addEventListener('visibilitychange', visibility)

    return {
        refresh, layout,
        toggle() { if (data && !stopped) { wanted = !wanted; syncButton(); if (root) layout(root); update(true) } },
        cleanup() {
            stopped = true; generation++; controller?.abort(); unsubscribe?.(); resize.disconnect()
            resetBrowsing(); stopScroll()
            window.removeEventListener('pointerup', pointerEnd)
            window.removeEventListener('pointercancel', pointerEnd)
            window.removeEventListener('touchend', pointerEnd)
            window.removeEventListener('touchcancel', pointerEnd)
            cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibility)
            root?.removeAttribute('data-mwt-lyrics'); panel?.remove(); source.clear()
            root = null; panel = null; rail = null; rows = []; countdown = null
        },
    }
}
