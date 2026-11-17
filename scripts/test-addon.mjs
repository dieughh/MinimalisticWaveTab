import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'

import config from '../addon.config.mjs'

const buildDir = new URL(`../dist/${config.directoryName}/`, import.meta.url)
const script = readFileSync(new URL('script.js', buildDir), 'utf8')
const metadata = JSON.parse(readFileSync(new URL('metadata.json', buildDir), 'utf8'))
assert.equal(metadata.id, config.id)
assert.equal(metadata.type, 'web-addon')
assert.equal(metadata.cssScope, 'global')
assert.deepEqual(
    metadata.settings.sections.flatMap(section => section.items.map(item => item.id)),
    ['playerWidth', 'coverOffsetX', 'animationScale', 'animationEnabled', 'animationLeftOffset', 'animationTopOffset'],
)

async function checkLayout({ lite = false, width = 1400, delayed = false, modern = true, mobile = false } = {}) {
    const window = new Window({
        url: 'https://music.yandex.ru/',
        settings: {
            enableJavaScriptEvaluation: true,
            suppressInsecureJavaScriptEnvironmentWarning: true,
        },
    })
    const { document } = window
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    window.__PULSESYNC_WEB_HOST__ = { React: {}, apiVersion: 1, capabilities: metadata.requirements.capabilities }
    const frames = new Map()
    let frameId = 0
    window.requestAnimationFrame = callback => {
        frames.set(++frameId, callback)
        return frameId
    }
    window.cancelAnimationFrame = id => frames.delete(id)
    function flushFrames() {
        for (const [id, callback] of [...frames]) {
            frames.delete(id)
            callback()
        }
    }
    const flushMutations = () => new Promise(resolve => setTimeout(resolve, 10))
    const css = document.createElement('style')
    css.textContent = readFileSync(new URL('script.css', buildDir), 'utf8')
    document.head.append(css)
    const unrelated = document.createElement('div')
    unrelated.innerHTML = '<img class="AlbumCover_cover__other"><canvas style="width: 12px"></canvas><div class="swiper"></div>'
    document.body.append(unrelated)
    const unrelatedBefore = unrelated.outerHTML
    const root = document.createElement('main')
    root.className = 'VibePage_root__test'
    root.style.color = 'red'
    const animationMarkup = lite ? '<div class="VibeWidgetAnimation_fallback__test"><img src="https://example.com/wave.png"></div>' : '<canvas></canvas>'
    root.innerHTML = `<div class="VibePage_meta__test"><div class="VibePage_textContainer__test">${modern || lite ? `<div class="VibeWidgetAnimation_root__test">${animationMarkup}</div>` : animationMarkup}</div><div class="VibeResetButton_root__test"></div><div class="VibePage_playerBlock__test"><div class="AlbumCover_root__test"></div>${modern ? '<div class="VibePlayerControls_root__test"><button data-pc-vibe-action="queue">Example queue</button><button class="VibePlayerControls_skipButton__test">Previous</button><button>Play</button><button data-pc-vibe-action="lyrics">Example lyrics</button></div>' : ''}</div></div><div class="swiper VibePage_wheel__test"></div>`
    if (mobile) root.querySelector('[class*="AlbumCover_root"]').innerHTML = '<button>Previous</button><div class="AlbumCover_coverContainer__test"><div class="AlbumCover_playButtonContainer__test"><button data-test-id="PLAY_BUTTON">Play</button></div></div><button>Next</button>'
    const background = document.createElement('div')
    background.id = 'vibe-background-container'
    background.innerHTML = '<canvas class="cbg-pixel-canvas" style="width: 100%; height: 100%"></canvas>'
    root.prepend(background)
    const backgroundBefore = background.outerHTML
    root.getBoundingClientRect = () => ({ width, height: 800, left: 0, top: 0, bottom: 800 })
    root.querySelector('[class*="VibePage_playerBlock"]').getBoundingClientRect = () => ({ top: 560, bottom: 800, height: 240 })
    const meta = root.querySelector('[class*="VibePage_meta"]')
    meta.getBoundingClientRect = () => ({ width: width - 600, height: 800, left: 600, top: 0 })
    const before = root.outerHTML
    if (!delayed) document.body.append(root)
    let values = { animationEnabled: false, playerWidth: 80, coverOffsetX: 30 }
    const listeners = new Set()
    const cleanups = []
    const queueCalls = []
    const api = {
        addonId: config.id,
        client: { openFullscreenPlayer: mode => { queueCalls.push(mode); return true } },
        settings: {
            getCurrent: () => values,
            onChange: callback => {
                listeners.add(callback)
                return () => listeners.delete(callback)
            },
        },
        onCleanup: callback => cleanups.push(callback),
        listen: (target, type, listener, options) => {
            target.addEventListener(type, listener, options)
            const remove = () => target.removeEventListener(type, listener, options)
            cleanups.push(remove)
            return remove
        },
        setTimeout: (callback, delay) => {
            const timer = setTimeout(callback, delay)
            const remove = () => clearTimeout(timer)
            cleanups.push(remove)
            return remove
        },
    }
    window.eval(script)
    const definition = window.__PULSESYNC_ADDON_QUEUE__[0]({})
    const deactivate = definition.activate(api)
    if (delayed) document.body.append(root)
    await flushMutations()
    flushFrames()
    assert(root.hasAttribute('data-mwt-active'))
    const framesBeforeUnrelatedMutation = frameId
    const unrelatedContent = document.createElement('span')
    unrelatedContent.textContent = 'Track progress outside Wave'
    unrelated.append(unrelatedContent)
    await flushMutations()
    assert.equal(frameId, framesBeforeUnrelatedMutation, 'mutations outside Wave must not schedule layout work')
    unrelatedContent.remove()
    await flushMutations()
    window.dispatchEvent(new window.Event('resize'))
    const framesAfterResize = frameId
    window.dispatchEvent(new window.Event('resize'))
    assert.equal(frameId, framesAfterResize, 'resize events within one frame must share one layout callback')
    flushFrames()
    assert.equal(root.querySelectorAll('#ps-custom-settings-btn').length, 1)
    if (modern || mobile) {
        const controls = root.querySelector(modern ? '[class*="VibePlayerControls_root"]' : '[class*="AlbumCover_root"]')
        const queue = controls.querySelector('[data-mwt-control="queue"]')
        const extra = controls.querySelector('[data-mwt-control="extra"]')
        assert.equal(controls.firstElementChild, queue)
        assert.equal(controls.lastElementChild, extra)
        queue.click()
        assert.deepEqual(queueCalls, ['queue'], 'queue button must open the native queue')
        let lyricsClicks = 0
        controls.querySelector(modern ? '[data-pc-vibe-action="lyrics"]' : '[data-test-id="PLAY_BUTTON"]').addEventListener('click', () => lyricsClicks++)
        extra.click()
        assert.equal(lyricsClicks, 0, 'the extra button must not open lyrics')
        assert.equal(extra.getAttribute('aria-disabled'), 'true')
        if (modern) {
            assert.equal(window.getComputedStyle(controls.querySelector('[data-pc-vibe-action="queue"]')).display, 'none')
            assert.equal(window.getComputedStyle(controls.querySelector('[data-pc-vibe-action="lyrics"]')).display, 'none')
        }
        assert.equal(controls.querySelectorAll('[data-mwt-control]').length, 2)
        const native = controls.querySelector('button:not([data-mwt-control]):not([data-pc-vibe-action])')
        const next = native.nextSibling
        controls.append(native)
        assert.equal(window.getComputedStyle(extra).order, '100', 'extra stays visually last before a React update is reconciled')
        await flushMutations()
        flushFrames()
        assert.equal(controls.lastElementChild, extra)
        controls.insertBefore(native, next)
        await flushMutations()
        flushFrames()
    }
    const animation = root.querySelector(modern || lite ? '[class*="VibeWidgetAnimation_root"]' : 'canvas:not(.cbg-pixel-canvas)')
    assert.equal(animation.parentElement, root.querySelector('[class*="VibePage_textContainer"]'), 'React must retain ownership of animation nodes')
    assert.equal(animation.style.display, 'none')
    assert.equal(root.style.getPropertyValue('--ps-player-width'), '80%')
    assert.equal(root.style.getPropertyValue('--ps-controls-offset'), '30px')
    assert.equal(root.querySelector('[class*="AlbumCover_root"]').style.transform, '', 'do not move the empty album cover instead of playback controls')
    values = { ...values, animationEnabled: true, animationScale: 1.2, animationLeftOffset: 10, animationTopOffset: 20 }
    for (const listener of listeners) listener(values)
    assert(parseFloat(animation.style.width) > 0, 'settings must apply geometry synchronously before the next paint')
    flushFrames()
    assert.equal(animation.style.display, '')
    assert(parseFloat(animation.style.width) > 0)
    assert.equal(animation.classList.contains('ps-lite-animation'), lite)
    assert.equal(animation.style.left, '50%')
    assert.equal(animation.style.top, '50%')
    assert(animation.style.transform.startsWith('translate(-50%, -50%)'), 'wave must follow the stable containing block, not intermediate screen coordinates')
    const toggle = root.querySelector('#ps-custom-settings-btn')
    toggle.click()
    flushFrames()
    assert.equal(toggle.getAttribute('aria-expanded'), 'true')
    assert.equal(window.localStorage.getItem('ps_wheel_open'), 'true')
    assert.equal(meta.getAttribute('data-ps-layout-mode'), width < 750 ? 'overlay-shift' : 'side')
    const scaleBeforeSettings = root.style.getPropertyValue('--ps-player-scale')
    values = { ...values, coverOffsetX: -40 }
    for (const listener of listeners) listener(values)
    assert.equal(root.style.getPropertyValue('--ps-player-scale'), scaleBeforeSettings, 'unrelated settings must not reset the player scale for a frame')
    assert.equal(root.style.getPropertyValue('--ps-controls-offset'), '-40px')
    const savedValues = values
    values = {}
    for (const listener of listeners) listener(values)
    assert.equal(root.style.getPropertyValue('--ps-player-width'), '80%', 'empty save snapshots must not flash the default width')
    assert.equal(root.style.getPropertyValue('--ps-player-scale'), scaleBeforeSettings)
    values = { coverOffsetX: 20 }
    for (const listener of listeners) listener(values)
    assert.equal(root.style.getPropertyValue('--ps-player-width'), '80%', 'partial settings must retain the applied player width')
    assert.equal(root.style.getPropertyValue('--ps-controls-offset'), '20px')
    values = savedValues
    for (const listener of listeners) listener(values)
    const defaults = Object.fromEntries(metadata.settings.sections.flatMap(section => section.items.map(item => [item.id, item.defaultValue])))
    values = defaults
    for (const listener of listeners) listener(values)
    assert.equal(root.style.getPropertyValue('--ps-player-width'), '80%', 'manifest-default broadcast must not expand the player')
    await new Promise(resolve => setTimeout(resolve, 60))
    values = { ...savedValues, playerWidth: 66 }
    for (const listener of listeners) listener(values)
    assert.equal(root.style.getPropertyValue('--ps-player-width'), '66%', 'saved settings must replace the transient defaults directly')
    values = defaults
    for (const listener of listeners) listener(values)
    assert.equal(root.style.getPropertyValue('--ps-player-width'), '66%')
    await new Promise(resolve => setTimeout(resolve, 330))
    assert.equal(root.style.getPropertyValue('--ps-player-width'), '100%', 'an intentional reset must apply stable defaults')
    values = savedValues
    for (const listener of listeners) listener(values)
    const context = root.querySelector('[class*="VibeResetButton_root"]')
    const contextNext = context.nextSibling
    context.remove()
    await flushMutations()
    flushFrames()
    assert.equal(root.querySelector('#ps-custom-settings-btn'), toggle, 'context removal must retain the same settings button')
    assert.equal(toggle.parentElement, meta, 'settings button belongs to the stable meta container')
    assert.equal(window.getComputedStyle(toggle).position, 'absolute', 'context height must not position the settings button')
    meta.insertBefore(context, contextNext)
    if (width < 750) {
        assert.equal(root.style.getPropertyValue('--ps-wheel-height'), '', 'wheel must retain its full height')
        assert(parseFloat(meta.style.marginLeft) >= 320, 'content must clear the complete wheel width')
        assert(parseFloat(root.style.getPropertyValue('--ps-player-scale')) < 1, 'player must shrink in a narrow window')
    }
    assert.equal(background.outerHTML, backgroundBefore, 'background canvas must not receive Wave layout styles')
    if (lite) {
        const originalImage = animation.firstElementChild
        animation.innerHTML = '<canvas></canvas>'
        animation.className = 'VibeWidgetAnimation_root__test'
        animation.removeAttribute('style')
        await flushMutations()
        flushFrames()
        assert(animation.classList.contains('ps-wave-animation'))
        assert(!animation.classList.contains('ps-lite-animation'))
        animation.replaceChildren(originalImage)
        animation.className = 'VibeWidgetAnimation_root__test'
        animation.removeAttribute('style')
        await flushMutations()
        flushFrames()
        assert(animation.classList.contains('ps-lite-animation'))
        assert(parseFloat(animation.style.width) > 0, 'Lite Mode geometry must survive React resetting attributes')
        assert.equal(animation.parentElement, root.querySelector('[class*="VibePage_textContainer"]'))
    }
    assert.equal(unrelated.outerHTML, unrelatedBefore)
    assert.notEqual(window.getComputedStyle(unrelated.querySelector('img')).display, 'none')
    // Navigation replaces the Wave page: new DOM must receive the current settings.
    const replacementContainer = document.createElement('div')
    replacementContainer.innerHTML = before
    const replacement = replacementContainer.firstElementChild
    replacement.getBoundingClientRect = root.getBoundingClientRect
    root.replaceWith(replacement)
    await flushMutations()
    flushFrames()
    assert.equal(replacement.querySelectorAll('#ps-custom-settings-btn').length, 1)
    assert.equal(replacement.style.getPropertyValue('--ps-player-width'), '80%')
    const freshAnimation = replacement.querySelector('.ps-wave-animation')
    assert.equal(window.getComputedStyle(freshAnimation).transition, 'none', 'fresh pages must not animate from the native oversized wave')
    for (const cleanup of cleanups) cleanup()
    deactivate()
    deactivate()
    assert.equal(listeners.size, 0)
    assert.equal(frames.size, 0)
    assert.equal(root.outerHTML, before)
    assert.equal(replacement.outerHTML, before)
    assert.equal(unrelated.outerHTML, unrelatedBefore)
    // Reactivation uses the persisted wheel state and installs only one button.
    const deactivateAgain = definition.activate(api)
    flushFrames()
    assert.equal(replacement.querySelectorAll('#ps-custom-settings-btn').length, 1)
    assert.equal(replacement.querySelector('#ps-custom-settings-btn').getAttribute('aria-expanded'), 'true')
    for (const cleanup of cleanups) cleanup()
    deactivateAgain()
    assert.equal(replacement.outerHTML, before)
    await window.happyDOM.close()
}

await checkLayout()
await checkLayout({ modern: false })
await checkLayout({ lite: true })
await checkLayout({ width: 650, delayed: true })
await checkLayout({ width: 650, modern: false, mobile: true })
console.log('OK: manifest, settings, canvas/Lite Mode, narrow layout, delayed mount, scoped styles, navigation, cleanup and reactivation')
