import type { AddonApi } from '@pulsesync/addon-sdk'
import { settings, type WaveSettings } from './settings'

// The original layout calculations are retained for desktop, narrow windows and Lite Mode.
export function startWaveLayout(api: AddonApi) {
    let currentSettings = settings.store
    let isFrozen = document.hidden
    let stopped = false
    let layoutFrame = 0
    let cachedRoot: HTMLElement | null = null
    let wheelOpen = false
    try {
        wheelOpen = localStorage.getItem('ps_wheel_open') === 'true'
    } catch {
        /* Use the default state. */
    }

    const snapshots = new Map<
        HTMLElement,
        { style: string | null; classes: boolean[]; hadClass: boolean; mode: string | null; active: string | null }
    >()
    const ownedClasses = ['ps-content-shifted', 'ps-canvas-shifted', 'ps-swiper-hidden-left', 'ps-lite-animation', 'ps-wave-animation']
    const buttons = new Set<HTMLButtonElement>()
    function remember<T extends HTMLElement>(element: T | null): T | null {
        if (element && !snapshots.has(element))
            snapshots.set(element, {
                style: element.getAttribute('style'),
                classes: ownedClasses.map(name => element.classList.contains(name)),
                hadClass: element.hasAttribute('class'),
                mode: element.getAttribute('data-ps-layout-mode'),
                active: element.getAttribute('data-mwt-active'),
            })
        return element
    }

    const SWIPER_HIDDEN_CLASS = 'ps-swiper-hidden-left'
    const STORAGE_KEY = 'ps_wheel_open'

    // ============================================================
    // ДИНАМИЧЕСКАЯ АДАПТАЦИЯ
    // ============================================================
    const BASE_WHEEL_WIDTH = 600
    const OVERLAY_THRESHOLD = 750
    const SIDE_GAP = 24
    const MIN_CONTENT_WIDTH = 560

    function getRoot() {
        const root = cachedRoot?.isConnected ? cachedRoot : remember(document.querySelector<HTMLElement>('[class*="VibePage_root"]'))
        cachedRoot = root
        if (root && !root.hasAttribute('data-mwt-active')) root.setAttribute('data-mwt-active', '')
        return root
    }

    function getMeta() {
        return remember(getRoot()?.querySelector<HTMLElement>('[class*="VibePage_meta"]') ?? null)
    }

    function getWheelElement() {
        return remember(getRoot()?.querySelector<HTMLElement>('.swiper[class*="VibePage_wheel"]') ?? null)
    }

    function getAnimationElement() {
        const root = getRoot()
        const animation = remember(root?.querySelector<HTMLElement>('[class*="VibeWidgetAnimation_root"], canvas:not(.cbg-pixel-canvas)') ?? null)
        if (animation && !animation.classList.contains('ps-wave-animation')) animation.classList.add('ps-wave-animation')
        return animation
    }

    function isLiteAnimationElement(el: HTMLElement) {
        return el.matches('[class*="VibeWidgetAnimation_root"]') && !el.querySelector('canvas')
    }

    function clampNumber(value: number, min: number, max: number) {
        return Math.min(max, Math.max(min, value))
    }

    function isOverlayMode(rootWidth: number) {
        const width = typeof rootWidth === 'number' && rootWidth > 0 ? rootWidth : window.innerWidth

        return width < OVERLAY_THRESHOLD
    }

    function isWheelOpen(swiper: HTMLElement | null) {
        return !!swiper && !swiper.classList.contains(SWIPER_HIDDEN_CLASS)
    }

    function scheduleLayout() {
        if (stopped || isFrozen || layoutFrame) return

        layoutFrame = requestAnimationFrame(() => {
            layoutFrame = 0
            updateLayout()
        })
    }

    let cancelBurst: (() => void)[] = []
    function scheduleLayoutBurst() {
        if (isFrozen) return
        cancelBurst.forEach(cancel => cancel())
        scheduleLayout()
        // ResizeObserver follows size changes; transitionend settles the final position.
        cancelBurst = [340].map(delay => api.setTimeout(scheduleLayout, delay))
    }

    function saveWheelState(isOpen: boolean) {
        wheelOpen = isOpen
        try {
            localStorage.setItem(STORAGE_KEY, String(isOpen))
        } catch {
            /* Keep the in-memory state. */
        }
    }

    function loadWheelState() {
        return wheelOpen
    }

    function applyWheelState(swiper: HTMLElement | null, content: HTMLElement | null, animation: HTMLElement | null, open: boolean) {
        if (!swiper) return
        const changed = swiper.classList.contains(SWIPER_HIDDEN_CLASS) === open
        if (changed) swiper.classList.toggle(SWIPER_HIDDEN_CLASS, !open)
        if (content && content.classList.contains('ps-content-shifted') !== open) content.classList.toggle('ps-content-shifted', open)
        if (animation && animation.classList.contains('ps-canvas-shifted') !== open) animation.classList.toggle('ps-canvas-shifted', open)
        if (changed) scheduleLayoutBurst()
    }

    function resetLayoutStyles(swiper: HTMLElement | null, meta: HTMLElement | null) {
        meta?.classList.remove('ps-content-shifted')
        for (const name of ['margin-left', 'width', 'max-width', 'padding-left', 'padding-right', 'transform', 'transform-origin'])
            meta?.style.removeProperty(name)
        meta?.removeAttribute('data-ps-layout-mode')
        for (const name of ['width', 'max-width', 'position', 'z-index', 'transform']) swiper?.style.removeProperty(name)
        const root = getRoot()
        for (const name of ['--ps-wheel-width', '--ps-wheel-max-width', '--ps-overlay-content-shift', '--ps-player-scale'])
            root?.style.removeProperty(name)
    }

    function applyAll(values: WaveSettings) {
        if (isFrozen) return
        const root = getRoot()
        root?.style.setProperty('--ps-player-width', values.playerWidth + '%')
        const cover = remember(root?.querySelector<HTMLElement>('[class*="AlbumCover_root"]') ?? null)
        if (cover) cover.style.transform = 'translateX(' + values.coverOffsetX + 'px)'
        const animation = getAnimationElement()
        if (animation) animation.style.display = values.animationEnabled ? '' : 'none'
        scheduleLayout()
    }

    function centerCanvas() {
        if (isFrozen) return
        const animation = getAnimationElement()
        if (!animation) return
        if (!currentSettings.animationEnabled) {
            animation.style.display = 'none'
            return
        }
        const root = getRoot()
        if (!root) return
        const rootRect = root.getBoundingClientRect()
        if (!rootRect.width || !rootRect.height) return
        const meta = getMeta()
        const useMeta = !!meta && isWheelOpen(getWheelElement())
        const frame = useMeta ? meta.getBoundingClientRect() : rootRect
        if (!frame.width || !frame.height) return
        const lite = isLiteAnimationElement(animation)
        const scale = currentSettings.animationScale
        const base = Math.min(frame.width, rootRect.height)
        const minSize = Math.min(260, base)
        const maxSize = Math.max(minSize, Math.min(1400, rootRect.height * 1.55, rootRect.width * 0.92))
        const size = lite ? clampNumber(base * 0.78 * scale, minSize, maxSize) : Math.max(frame.width, rootRect.height) * scale
        const left = (useMeta ? frame.left - rootRect.left : 0) + (frame.width - size) / 2 + currentSettings.animationLeftOffset
        const top = (rootRect.height - size) / 2 + currentSettings.animationTopOffset
        animation.classList.toggle('ps-lite-animation', lite)
        animation.style.display = ''
        animation.style.position = 'absolute'
        animation.style.setProperty('width', size + 'px', 'important')
        animation.style.setProperty('height', size + 'px', 'important')
        animation.style.zIndex = '1'
        animation.style.pointerEvents = 'none'
        // Keep React-owned nodes in place; translate root coordinates into their containing block.
        const parent = animation.offsetParent as HTMLElement | null
        const parentRect = parent?.getBoundingClientRect() ?? rootRect
        const originX = rootRect.left - parentRect.left - (parent?.clientLeft ?? 0) + (parent?.scrollLeft ?? 0)
        const originY = rootRect.top - parentRect.top - (parent?.clientTop ?? 0) + (parent?.scrollTop ?? 0)
        animation.style.setProperty('left', (originX + (lite ? left : 0)) + 'px', 'important')
        animation.style.setProperty('top', (originY + (lite ? top : 0)) + 'px', 'important')
        animation.style.setProperty('transform', lite ? 'none' : 'translate(' + left + 'px, ' + top + 'px)', 'important')
        if (!lite) animation.style.objectFit = 'cover'
        else {
            animation.style.margin = '0'
            animation.style.padding = '0'
            animation.style.boxSizing = 'border-box'
            animation.style.alignItems = 'normal'
            animation.style.justifyContent = 'normal'
            animation.style.overflow = 'visible'
            const img = remember(animation.querySelector<HTMLImageElement>('img'))
            if (img) {
                img.style.display = 'block'
                img.style.width = '100%'
                img.style.height = '100%'
                img.style.objectFit = 'contain'
                img.style.margin = '0'
                img.style.padding = '0'
                img.style.pointerEvents = 'none'
            }
        }
    }

    function updateLayout() {
        if (isFrozen) return
        const root = getRoot()
        if (!root) return
        const swiper = getWheelElement()
        const meta = getMeta()
        // Mirror the context heading's top inset at the bottom of the player.
        if (meta) root.style.setProperty('--ps-bottom-gap', getComputedStyle(meta).paddingTop)
        let rect = root.getBoundingClientRect()
        const nav = document.querySelector<HTMLElement>('[class*="NavbarMobile_root"]')
        const navHeight = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().height : 0
        root.style.setProperty('--ps-page-height', Math.max(0, innerHeight - rect.top - navHeight) + 'px')
        rect = root.getBoundingClientRect()
        if (!swiper || !meta) {
            centerCanvas()
            return
        }
        if (!isWheelOpen(swiper)) {
            resetLayoutStyles(swiper, meta)
            centerCanvas()
            return
        }
        const width = rect.width || innerWidth
        let wheelWidth = width < 960 ? 340 : width < 1100 ? 420 : BASE_WHEEL_WIDTH
        wheelWidth = Math.max(280, Math.min(wheelWidth, Math.floor(width * 0.42)))
        const compact = isOverlayMode(width) || width - wheelWidth - SIDE_GAP < MIN_CONTENT_WIDTH
        if (compact) wheelWidth = Math.min(320, Math.floor(width * 0.8))
        const occupied = wheelWidth + (compact ? 12 : SIDE_GAP)
        root.style.setProperty('--ps-wheel-width', wheelWidth + 'px')
        root.style.setProperty('--ps-wheel-max-width', compact ? '80vw' : '90vw')
        // Keep the wheel at its original full height; fit the player beside it.
        root.style.setProperty('--ps-player-scale', String(Math.min(1, Math.max(1, width - occupied - 32) / 520)))
        swiper.style.width = wheelWidth + 'px'
        swiper.style.maxWidth = compact ? '80vw' : '90vw'
        swiper.style.position = 'absolute'
        swiper.style.transform = ''
        swiper.style.zIndex = compact ? '200' : '100'
        meta.classList.add('ps-content-shifted')
        meta.setAttribute('data-ps-layout-mode', compact ? 'overlay-shift' : 'side')
        meta.style.marginLeft = occupied + 'px'
        meta.style.setProperty('width', 'calc(100% - ' + occupied + 'px)', 'important')
        meta.style.setProperty('max-width', 'calc(100% - ' + occupied + 'px)', 'important')
        meta.style.paddingLeft = '16px'
        meta.style.paddingRight = '16px'
        meta.style.transform = ''
        meta.style.transformOrigin = ''
        centerCanvas()
    }

    function refresh() {
        if (stopped || isFrozen) return
        const root = getRoot()
        if (!root) return
        const swiper = getWheelElement()
        const meta = getMeta()
        const animation = getAnimationElement()
        if (swiper) applyWheelState(swiper, meta, animation, loadWheelState())
        if (swiper && !root.querySelector('#ps-custom-settings-btn')) {
            const button = document.createElement('button')
            button.id = 'ps-custom-settings-btn'
            button.type = 'button'
            button.textContent = 'Настроить'
            button.setAttribute('aria-label', 'Настроить Мою волну')
            button.setAttribute('aria-expanded', String(wheelOpen))
            button.addEventListener('click', () => {
                if (stopped || isFrozen) return
                saveWheelState(!wheelOpen)
                button.setAttribute('aria-expanded', String(wheelOpen))
                applyWheelState(getWheelElement(), getMeta(), getAnimationElement(), wheelOpen)
            })
            const reset = root.querySelector('[class*="VibeResetButton_root"]')
            if (reset) reset.after(button)
            else if (meta) {
                const player = meta.querySelector('[class*="VibePage_playerBlock"]')
                meta.insertBefore(button, player)
            }
            if (button.isConnected) buttons.add(button)
        }
        applyAll(currentSettings)
    }

    const observer = new MutationObserver(records => {
        if (stopped || isFrozen) return
        if (records.some(record => record.type === 'childList')) {
            refresh()
            return
        }
        // React resets the wrapper's class/style after a Lite Mode transition.
        // Only react to native updates, not to our own class changes.
        if (records.some(({ target }) => target instanceof HTMLElement &&
            target.matches('[class*="VibeWidgetAnimation_root"], canvas:not(.cbg-pixel-canvas)') &&
            !target.classList.contains('ps-wave-animation'))) refresh()
    })
    const resizeObserver = new ResizeObserver(scheduleLayoutBurst)
    let observedRoot: HTMLElement | null = null
    function observeRootSize() {
        const root = getRoot()
        if (root === observedRoot) return
        resizeObserver.disconnect()
        observer.disconnect()
        observedRoot = root
        if (root) {
            resizeObserver.observe(root)
            observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
            refresh()
        }
    }
    // Only discover a new Wave page when the previous root has been detached.
    const rootObserver = new MutationObserver(() => {
        if (!stopped && !observedRoot?.isConnected) observeRootSize()
    })
    function begin() {
        if (stopped || !document.body) return
        rootObserver.observe(document.body, { childList: true, subtree: true })
        observeRootSize()
    }
    const removeSettingsListener = api.settings.onChange(() => {
        currentSettings = settings.store
        refresh()
    })
    api.listen(window, 'resize', scheduleLayoutBurst)
    api.listen(document, 'visibilitychange', () => {
        isFrozen = document.hidden
        if (isFrozen) {
            cancelAnimationFrame(layoutFrame)
            layoutFrame = 0
        } else {
            refresh()
            scheduleLayoutBurst()
        }
    })
    api.listen(
        document,
        'transitionend',
        event => {
            if (event.target instanceof Element && event.target.matches('[class*="VibePage_meta"], .swiper[class*="VibePage_wheel"]'))
                scheduleLayout()
        },
        { capture: true },
    )

    const cleanup = () => {
        if (stopped) return
        stopped = true
        isFrozen = true
        observer.disconnect()
        rootObserver.disconnect()
        resizeObserver.disconnect()
        removeSettingsListener()
        cancelAnimationFrame(layoutFrame)
        cancelBurst.forEach(cancel => cancel())
        buttons.forEach(button => button.remove())
        for (const [element, snapshot] of snapshots) {
            if (snapshot.style === null) element.removeAttribute('style')
            else element.setAttribute('style', snapshot.style)
            ownedClasses.forEach((name, index) => element.classList.toggle(name, snapshot.classes[index]))
            if (!snapshot.hadClass && !element.className) element.removeAttribute('class')
            for (const [name, value] of [
                ['data-ps-layout-mode', snapshot.mode],
                ['data-mwt-active', snapshot.active],
            ] as const) {
                if (value === null) element.removeAttribute(name)
                else element.setAttribute(name, value)
            }
        }
        cachedRoot = null
        observedRoot = null
        snapshots.clear()
        buttons.clear()
    }
    api.onCleanup(cleanup)
    if (document.body) begin()
    else api.listen(document, 'DOMContentLoaded', begin, { once: true })
    return cleanup
}
