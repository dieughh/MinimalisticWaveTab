import type { AddonApi } from '@pulsesync/addon-sdk'

type QueueClient = AddonApi['client'] & {
    openFullscreenPlayer?: (mode: 'queue') => boolean | Promise<boolean>
}

export function createWaveControls(api: AddonApi, lyrics?: { toggle: () => void; refresh: (root: HTMLElement) => void }) {
    const owned = new Set<HTMLButtonElement>()
    let stopped = false
    let cancelQueueOpen: (() => void) | undefined

    async function openQueue() {
        if (stopped) return
        const client = api.client as QueueClient | undefined
        if (client?.openFullscreenPlayer) {
            await client.openFullscreenPlayer('queue')
            return
        }
        // Older hosts expose the same action in the native player context menu.
        const selector = '[data-test-id="VIBE_CONTEXT_MENU_PLAY_QUEUE_ITEM"]'
        const item = document.querySelector<HTMLButtonElement>(selector)
        if (item) item.click()
        else {
            document.querySelector<HTMLButtonElement>('[data-mwt-active] [data-test-id="VIBE_CONTEXT_MENU_BUTTON"]')?.click()
            cancelQueueOpen?.()
            cancelQueueOpen = api.setTimeout(() => {
                if (!stopped) document.querySelector<HTMLButtonElement>(selector)?.click()
            }, 50)
        }
    }

    function makeButton(reference: HTMLButtonElement, action: string, label: string, icon: string) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = reference.className
        button.classList.add('ps-mwt-control')
        button.dataset.mwtControl = action
        button.setAttribute('aria-label', label)
        button.title = label
        const span = document.createElement('span')
        span.className = reference.querySelector('span')?.className ?? ''
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('class', reference.querySelector('svg')?.getAttribute('class') ?? '')
        svg.setAttribute('aria-hidden', 'true')
        svg.setAttribute('focusable', 'false')
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
        use.setAttribute('href', '/icons/sprite.svg#' + icon)
        svg.append(use)
        span.append(svg)
        button.append(span)
        owned.add(button)
        return button
    }

    function refresh(root: HTMLElement) {
        for (const button of owned) {
            if (!button.isConnected) {
                button.remove()
                owned.delete(button)
            }
        }
        const controls = root.querySelector<HTMLElement>('[class*="VibePlayerControls_root"]') ??
            root.querySelector<HTMLElement>('[class*="AlbumCover_root"]:has([data-test-id="PLAY_BUTTON"])')
        if (!controls) return
        const reference = controls.querySelector<HTMLButtonElement>('button[class*="VibePlayerControls_skipButton"]:not([data-mwt-control]):not([data-pc-vibe-action])') ??
            controls.querySelector<HTMLButtonElement>('button:not([data-mwt-control]):not([data-pc-vibe-action])')
        if (!reference) return
        if (!controls.querySelector('[data-mwt-control="queue"]')) {
            const queue = makeButton(reference, 'queue', 'Открыть очередь', 'playQueue_xxs')
            queue.addEventListener('click', () => {
                void openQueue().catch(error => api.logger?.warn('Не удалось открыть очередь', error))
            })
            controls.prepend(queue)
        }
        if (!controls.querySelector('[data-mwt-control="extra"]')) {
            const extra = makeButton(reference, 'extra', 'Дополнительная кнопка', 'syncLyrics_xxs')
            extra.setAttribute('aria-disabled', 'true')
            extra.addEventListener('click', () => lyrics?.toggle())
            controls.append(extra)
        }
        // React may append repeat/shuffle controls after our nodes on track changes.
        const queue = controls.querySelector<HTMLButtonElement>('[data-mwt-control="queue"]')!
        const extra = controls.querySelector<HTMLButtonElement>('[data-mwt-control="extra"]')!
        if (controls.firstElementChild !== queue) controls.prepend(queue)
        if (controls.lastElementChild !== extra) controls.append(extra)
        lyrics?.refresh(root)
    }

    function cleanup() {
        stopped = true
        cancelQueueOpen?.()
        owned.forEach(button => button.remove())
        owned.clear()
    }

    return { refresh, cleanup }
}
