import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { transformWithOxc } from 'vite'
import { Window } from 'happy-dom'
import config from '../addon.config.mjs'

const temp = path.resolve('.pulsesync-dev/lyrics-tests')
mkdirSync(temp, { recursive: true })
for (const name of ['lyrics-data', 'lyrics-source']) {
    const { code } = await transformWithOxc(readFileSync(`src/${name}.ts`, 'utf8'), `${name}.ts`)
    writeFileSync(path.join(temp, name + '.mjs'), code.replaceAll("'./lyrics-data'", "'./lyrics-data.mjs'").replaceAll('"./lyrics-data"', '"./lyrics-data.mjs"'))
}
const { parseLyrics, activeLine, introCountdown } = await import(pathToFileURL(path.join(temp, 'lyrics-data.mjs')))
const { createLyricsSource, withoutFilmCredit } = await import(pathToFileURL(path.join(temp, 'lyrics-source.mjs')))

const fixture = { id: 1, trackName: 'Fixture', artistName: 'Tester', albumName: 'Album', duration: 100, hasWordSync: false, syncedLyrics: '[00:00] One two\n[00:02] Next line\n[00:04] ' }
const parsed = parseLyrics(fixture, 100000)
assert.equal(activeLine(parsed.lines, 1999), 0)
assert.equal(activeLine(parsed.lines, 2000), 1)
assert.equal(parseLyrics({ syncedLyrics: null }, 100000), null)
assert.equal(parseLyrics({ instrumental: true, syncedLyrics: '[00:00] Text' }, 100000), null)
assert.equal(parseLyrics({ ...fixture, hasWordSync: true }, 100000), null)
assert.equal(parseLyrics({ syncedLyrics: '[00:01]<00:01>One <00:02>two' }, 100000), null)
assert.equal(parseLyrics({ syncedLyrics: '[00:01][00:03] Repeated' }, 100000).lines.length, 2)
const intro = parseLyrics({ syncedLyrics: '[00:00]\n[00:05] First line' }, 100000)
for (const [position, count] of [[0,0],[1999,0],[2000,3],[3000,2],[4000,1],[4999,1],[5000,0],[9000,0]]) {
    assert.equal(introCountdown(intro.lines, position), count)
}
assert.equal(introCountdown(parsed.lines, 0), 0)

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const response = (value, status = 200, retry = null) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => retry }, text: async () => JSON.stringify(value) })
const timer = (callback, delay) => { const id = setTimeout(callback, Math.min(delay, 5)); return () => clearTimeout(id) }
const signature = { title: 'Fixture', artist: 'Tester', artists: ['Tester'], album: 'Album', duration: 100000 }
const calls = []
const source = createLyricsSource({ setTimeout: timer, net: { fetch: async url => {
    calls.push(url)
    return response(url.includes('/search?') ? [{ ...fixture, hasWordSync: true }, fixture, { ...fixture, id: 2, duration: 150 }] : { ...fixture, hasWordSync: true })
} } })
assert.equal((await source.load(signature, new AbortController().signal)).lines[0].text, 'One two', 'skip word sync and find a line-synchronized version')
const requestCount = calls.length
assert.equal(requestCount, 2, 'ordinary titles need no extra fallback requests')
await source.load(signature, new AbortController().signal)
assert.equal(calls.length, requestCount, 'cached tracks must not send additional requests')
for (const title of ['I Want To Break Free из фильма «Богемская рапсодия»', 'I Want To Break Free (из фильма «Богемская рапсодия»)', 'I Want To Break Free — From the Movie "Bohemian Rhapsody"']) {
    assert.equal(withoutFilmCredit(title), 'I Want To Break Free')
}
for (const title of ['Fixture (Live)', 'Fixture - Remix', 'Fixture (Radio Edit)', 'Theme from New York, New York']) assert.equal(withoutFilmCredit(title), title)
const filmCalls = []
const filmSource = createLyricsSource({ setTimeout: timer, net: { fetch: async url => {
    const query = new URL(url); filmCalls.push(query)
    return response(query.searchParams.get('track_name') === 'Fixture' ? { ...fixture, albumName: 'Original release' } : url.includes('/search?') ? [] : {}, url.includes('/search?') || query.searchParams.get('track_name') === 'Fixture' ? 200 : 404)
} } })
const filmTrack = { ...signature, title: 'Fixture из фильма «Фильм»', album: 'Soundtrack' }
assert.equal((await filmSource.load(filmTrack, new AbortController().signal)).lines[0].text, 'One two')
assert.equal(filmCalls.at(-1).searchParams.get('album_name'), null, 'fallback must allow the original release album')
const wrongFilm = createLyricsSource({ setTimeout: timer, net: { fetch: async url => response(url.includes('/search?') ? [{ ...fixture, trackName: 'Fixture (Live)' }, { ...fixture, duration: 150 }, { ...fixture, artistName: 'Cover artist' }] : {}, url.includes('/search?') ? 200 : 404) } })
assert.equal(await wrongFilm.load(filmTrack, new AbortController().signal), null, 'soundtrack fallback must not accept live versions, different durations or covers')
const wrong = createLyricsSource({ setTimeout: timer, net: { fetch: async url => response(url.includes('/search?') ? [{ ...fixture, artistName: 'NotTester' }] : { ...fixture, duration: 150 }) } })
assert.equal(await wrong.load(signature, new AbortController().signal), null, 'reject another recording or another artist')
let limitedCalls = 0
const limited = createLyricsSource({ setTimeout: timer, net: { fetch: async () => { limitedCalls++; return response({}, 429, '60') } } })
await assert.rejects(limited.load(signature, new AbortController().signal))
assert.equal(await limited.load(signature, new AbortController().signal), null)
assert.equal(limitedCalls, 1, 'do not retry inside Retry-After')

const window = new Window({ url: 'https://music.yandex.ru/', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true } })
const { document } = window
Object.defineProperty(document, 'hidden', { value: false, configurable: true })
let clock = 0, frames = new Map(), frameId = 0
window.performance.now = () => clock
window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId }
window.cancelAnimationFrame = id => frames.delete(id)
const flush = () => { for (const [id, callback] of [...frames]) { frames.delete(id); callback(clock) } }
const metadata = JSON.parse(readFileSync(`dist/${config.directoryName}/metadata.json`, 'utf8'))
window.__PULSESYNC_WEB_HOST__ = { React: {}, apiVersion: 1, capabilities: metadata.requirements.capabilities }
const style = document.createElement('style'); style.textContent = readFileSync(`dist/${config.directoryName}/script.css`, 'utf8'); document.head.append(style)
document.body.innerHTML = '<main class="VibePage_root__test"><div class="VibePage_meta__test"><div class="VibePage_entityMeta__test"><div class="VibeWidgetAnimation_root__test"><img></div></div><div class="VibePage_playerBlock__test"><div class="VibePlayerBar_progress__test"></div><div class="VibePlayerControls_root__test"><button class="VibePlayerControls_skipButton__test">Previous</button><button>Play</button></div></div></div><div class="swiper VibePage_wheel__test"></div></main>'
const root = document.querySelector('main')
root.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 1200, height: 800, bottom: 800 })
const listeners = new Set(), settingListeners = new Set(), cleanups = [], seeks = []
const idleTimers = new Map()
let snapshot = { track: { id: 'fixture', title: 'Fixture', artists: [{ name: 'Tester' }], albums: [{ title: 'Album' }], durationMs: 100000 }, progress: { position: 0, duration: 100 }, isPlaying: false }
let releaseDelayed
const api = {
    addonId: config.id,
    player: { getSnapshot: async () => snapshot, onChange: fn => { listeners.add(fn); return () => listeners.delete(fn) } },
    client: { setProgress: async seconds => { seeks.push(seconds) }, openFullscreenPlayer: () => true },
    net: { fetch: async url => {
        const name = new URL(url).searchParams.get('track_name')
        if (name === 'Delayed') return await new Promise(resolve => { releaseDelayed = () => resolve(response({ ...fixture, trackName: 'Delayed' })) })
        if (name === 'Intro') return response({ ...fixture, trackName: 'Intro', syncedLyrics: '[00:00]\n[00:05] First line\n[00:08] Second line' })
        if (name === 'Plain') return response(url.includes('/search?') ? [] : { ...fixture, trackName: 'Plain', hasWordSync: false, syncedLyrics: null, lyricsfile: 'lines:\n- text: Plain only', plainLyrics: 'Plain only' })
        if (name === 'Missing') return response(url.includes('/search?') ? [] : {}, url.includes('/search?') ? 200 : 404)
        return response(fixture)
    } },
    settings: { getCurrent: () => ({ playerWidth: 55 }), onChange: fn => { settingListeners.add(fn); return () => settingListeners.delete(fn) } },
    logger: { warn() {} },
    onCleanup: fn => cleanups.push(fn),
    listen: (target, name, fn, options) => { target.addEventListener(name, fn, options); const off = () => target.removeEventListener(name, fn, options); cleanups.push(off); return off },
    setTimeout: (fn, delay) => {
        if (delay === 1500) {
            const id = Symbol(); idleTimers.set(id, fn)
            const cancel = () => idleTimers.delete(id); cleanups.push(cancel); return cancel
        }
        const cancel = timer(fn, delay); cleanups.push(cancel); return cancel
    },
}
window.eval(readFileSync(`dist/${config.directoryName}/script.js`, 'utf8'))
const deactivate = window.__PULSESYNC_ADDON_QUEUE__[0]({}).activate(api)
await wait(30); flush(); await wait(10); flush()
let button = root.querySelector('[data-mwt-control="extra"]')
assert.equal(button.disabled, false)
button.click(); flush()
assert.equal(root.dataset.mwtLyrics, 'open')
assert.equal(window.getComputedStyle(root.querySelector('.ps-wave-animation')).display, 'none')
assert.equal(root.querySelector('[data-line="0"]').dataset.state, 'active')
const emit = changes => { snapshot = { ...snapshot, ...changes }; listeners.forEach(fn => fn(snapshot)) }
emit({ isPlaying: true, progress: { position: 0 } })
clock = 500; flush()
assert.equal(root.querySelector('.ps-mwt-lyric-word'), null)
assert.equal(root.querySelector('[data-line="0"]').dataset.state, 'active')
emit({ isPlaying: false, progress: { position: 0.5 } })
clock = 5000; flush()
assert.equal(root.querySelector('[data-line="0"]').dataset.state, 'active', 'paused lyrics must not drift')
emit({ progress: { position: 3 } }); flush()
assert.equal(root.querySelector('[data-line="1"]').dataset.state, 'active')
const panel = root.querySelector('.ps-mwt-lyrics')
const scrollRequests = []
// The DOM fixture has no compositor: capture native scroll requests without simulating animation.
panel.scrollTo = options => {
    scrollRequests.push({ ...options })
    if (options.behavior === 'instant') panel.scrollTop = options.top
}
Object.defineProperty(panel, 'clientHeight', { value: 200 })
Object.defineProperty(panel, 'scrollHeight', { value: 1000 })
root.querySelectorAll('[data-line]').forEach((row, i) => {
    Object.defineProperty(row, 'offsetTop', { value: 100 + i * 80 })
    Object.defineProperty(row, 'offsetHeight', { value: 60 })
})
panel.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 200 }))
panel.scrollTop = 250; panel.dispatchEvent(new window.Event('scroll'))
assert.equal(panel.dataset.follow, 'manual')
emit({ progress: { position: 0.5 } }); flush()
assert.equal(panel.scrollTop, 250, 'playback updates must not fight manual browsing')
emit({ progress: { position: 3 } }); flush()
assert.equal(panel.scrollTop, 250)
assert.equal(idleTimers.size, 1, 'every scroll must replace the 1.5-second inactivity timer')
const finishIdle = () => { const entries = [...idleTimers]; entries.forEach(([id, fn]) => { idleTimers.delete(id); fn() }) }
panel.dispatchEvent(new window.PointerEvent('pointerdown'))
finishIdle()
assert.equal(panel.dataset.follow, 'manual', 'do not recenter while a pointer is held')
window.dispatchEvent(new window.PointerEvent('pointerup'))
finishIdle()
assert.equal(panel.dataset.follow, 'auto')
flush(); clock += 1400; flush()
assert.deepEqual(scrollRequests.at(-1), { top: 110, behavior: 'smooth' }, 'return must use browser scrolling to the current line')
panel.scrollTop = 110
assert.equal(panel.scrollTop, 110, 'return to the current line after inactivity, not the line active when browsing began')
root.querySelector('[data-line="0"]').click()
assert.equal(seeks.at(-1), 0)
assert.equal(panel.scrollTop, 110, 'click must start animation without an instant jump')
assert.deepEqual(scrollRequests.at(-1), { top: 30, behavior: 'smooth' })
const seekScrollCount = scrollRequests.length
emit({ progress: { position: 3 } }); flush()
assert.equal(root.querySelector('[data-line="0"]').dataset.state, 'active', 'old snapshots must not undo a clicked seek')
assert.equal(panel.scrollTop, 110)
clock += 100; flush()
assert.equal(panel.scrollTop, 110, 'JavaScript frames must not drive browser scrolling')
emit({ progress: { position: 0 } }); flush()
assert.equal(scrollRequests.length, seekScrollCount, 'seek confirmation must not restart native animation')
clock += 400; flush()
panel.scrollTop = 30
assert.equal(panel.scrollTop, 30)
button.click()
assert.equal(root.dataset.mwtLyrics, undefined)
assert.notEqual(root.querySelector('.ps-wave-animation').style.display, 'none')
emit({ track: { ...snapshot.track, id: 'intro', title: 'Intro' }, isPlaying: false, progress: { position: 2 } })
await wait(30); flush()
button.click(); flush()
const countdown = root.querySelector('.ps-mwt-lyrics-countdown')
assert.equal(countdown.hidden, false)
assert.equal(countdown.textContent, '3')
emit({ progress: { position: 3 } }); flush()
assert.equal(countdown.textContent, '2')
clock += 5000; flush()
assert.equal(countdown.textContent, '2', 'pause must freeze countdown')
emit({ progress: { position: 4 } }); flush()
assert.equal(countdown.textContent, '1')
emit({ progress: { position: 5 } }); flush()
assert.equal(countdown.hidden, true)
assert.equal(root.querySelector('[data-line="1"]').dataset.state, 'active')
emit({ progress: { position: 2 } }); flush()
assert.equal(countdown.textContent, '3', 'seeking back must restore countdown')
emit({ track: { ...snapshot.track, id: 'plain', title: 'Plain' }, progress: { position: 0 } })
await wait(40); flush()
assert.equal(button.disabled, true, 'plain-only records must not activate the lyrics button')
emit({ track: { ...snapshot.track, id: 'delayed', title: 'Delayed' } })
await wait(15)
emit({ track: { ...snapshot.track, id: 'missing', title: 'Missing' } })
releaseDelayed?.()
await wait(40); flush()
assert.equal(button.disabled, true, 'a stale response from the previous track must not enable lyrics')
assert.equal(root.dataset.mwtLyrics, undefined)
assert.equal(root.querySelector('.ps-mwt-lyrics').hidden, true)
deactivate(); cleanups.forEach(fn => fn()); flush()
assert.equal(root.querySelector('.ps-mwt-lyrics'), null)
assert.equal(listeners.size, 0)
assert.equal(frames.size, 0)
assert.equal(idleTimers.size, 0)
await window.happyDOM.close()
console.log('OK: strict synced-only parsing, line-only LRC, intro countdown, matching, cache, rate limits, playback, pause, seek, missing/plain tracks, stale responses and cleanup')
