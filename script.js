const ADDON_NAME = 'Minimalistic Wave Tab';

function unwrapSetting(entry, fallback) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        if (typeof entry.value !== 'undefined') return entry.value;
        if (typeof entry.default !== 'undefined') return entry.default;
    }
    return typeof entry !== 'undefined' ? entry : fallback;
}

let currentSettings = {};
let settingsApi = null;
let isFrozen = false; // флаг заморозки

function applyAll(s) {
    if (isFrozen) return;
    const playerWidth = unwrapSetting(s.playerWidth, 100);
    const coverOffsetX = unwrapSetting(s.coverOffsetX, 0);

    document.documentElement.style.setProperty('--ps-player-width', playerWidth + '%');

    const cover = document.querySelector('[class*="AlbumCover_root"]');
    if (cover) {
        cover.style.transform = `translateX(${coverOffsetX}px)`;
    }

    const canvas = document.querySelector('canvas');
    if (canvas) {
        canvas.style.display = unwrapSetting(s.animationEnabled, true) ? '' : 'none';
    }
    centerCanvas();
}

function centerCanvas() {
    if (isFrozen) return;
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    if (!currentSettings || !unwrapSetting(currentSettings.animationEnabled, true)) {
        canvas.style.display = 'none';
        return;
    }
    canvas.style.display = '';

    requestAnimationFrame(() => {
        if (isFrozen) return;
        const root = document.querySelector('[class*="VibePage_root"]');
        if (!root) return;
        const rootRect = root.getBoundingClientRect();
        if (rootRect.width === 0 || rootRect.height === 0) return;

        const scale = unwrapSetting(currentSettings.animationScale, 1.5);
        const size = Math.max(rootRect.width, rootRect.height) * scale;
        const topOffset = unwrapSetting(currentSettings.animationTopOffset, 0);
        const leftOffset = unwrapSetting(currentSettings.animationLeftOffset, 0);

        canvas.style.position = 'absolute';
        canvas.style.left = (rootRect.width - size) / 2 + leftOffset + 'px';
        canvas.style.top = (rootRect.height - size) / 2 + topOffset + 'px';
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        canvas.style.zIndex = '1';
        canvas.style.pointerEvents = 'none';
        canvas.style.objectFit = 'cover';
    });
}

function moveCanvasToRoot() {
    if (isFrozen) return false;
    const canvas = document.querySelector('canvas');
    if (!canvas) return false;
    const root = document.querySelector('[class*="VibePage_root"]');
    if (root && canvas.parentElement !== root) {
        root.insertBefore(canvas, root.firstChild);
        return true;
    }
    return false;
}

const canvasObserver = new MutationObserver(() => {
    if (isFrozen) return;
    if (moveCanvasToRoot()) {
        canvasObserver.disconnect();
    }
    if (currentSettings && Object.keys(currentSettings).length > 0) {
        applyAll(currentSettings);
        centerCanvas();
    }
});

const coverObserver = new MutationObserver(() => {
    if (isFrozen) return;
    const cover = document.querySelector('[class*="AlbumCover_root"]');
    if (cover && currentSettings && Object.keys(currentSettings).length > 0) {
        applyAll(currentSettings);
        coverObserver.disconnect();
    }
});

const SWIPER_HIDDEN_CLASS = 'ps-swiper-hidden-left';
const STORAGE_KEY = 'ps_wheel_open';

function saveWheelState(isOpen) {
    localStorage.setItem(STORAGE_KEY, isOpen ? 'true' : 'false');
}

function loadWheelState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'true';
}

function applyWheelState(swiper, content, canvasEl, isOpen) {
    if (isOpen) {
        swiper.classList.remove(SWIPER_HIDDEN_CLASS);
        if (content) content.classList.add('ps-content-shifted');
        if (canvasEl) canvasEl.classList.add('ps-canvas-shifted');
    } else {
        swiper.classList.add(SWIPER_HIDDEN_CLASS);
        if (content) content.classList.remove('ps-content-shifted');
        if (canvasEl) canvasEl.classList.remove('ps-canvas-shifted');
    }
}

function initSwiperToggle() {
    if (isFrozen) return;
    const swiper = document.querySelector('.swiper');
    if (!swiper) return;

    const meta = document.querySelector('[class*="VibePage_meta"]');
    const canvas = document.querySelector('canvas');

    const savedOpen = loadWheelState();
    applyWheelState(swiper, meta, canvas, savedOpen);

    if (document.getElementById('ps-custom-settings-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'ps-custom-settings-btn';
    btn.type = 'button';
    btn.className = 'cpeagBA1_PblpJn8Xgtv iJVAJMgccD4vj4E4o068 zIMibMuH7wcqUoW7KH1B IlG7b1K0AD7E7AMx6F5p nHWc2sto1C6Gm0Dpw_l0 C_QGmfTz6UFX93vfPt6Z qU2apWBO1yyEK0lZ3lPO kc5CjvU5hT9KEj0iTt3C VibeSettings_toggleSettingsButton__j6fIU';
    btn.setAttribute('aria-label', 'Настроить Мою волну');
    btn.innerHTML = `
        <span class="JjlbHZ4FaP9EAcR_1DxF">
            <svg class="J9wTKytjOWG73QMoN5WP elJfazUBui03YWZgHCbW l3tE1hAMmBj2aoPPwU08" focusable="false" aria-hidden="true">
                <use xlink:href="/icons/sprite.svg#filter_xxs"></use>
            </svg>
            <span class="_MWOVuZRvUQdXKTMcOPx tk7ahHRDYXJMMB879KUA _3_Mxw7Si7j2g4kWjlpR">Настроить</span>
        </span>
    `;

    btn.addEventListener('click', () => {
        if (isFrozen) return;
        const isCurrentlyOpen = !swiper.classList.contains(SWIPER_HIDDEN_CLASS);
        const newIsOpen = !isCurrentlyOpen;
        
        swiper.classList.toggle(SWIPER_HIDDEN_CLASS);
        const content = document.querySelector('[class*="VibePage_meta"]');
        const canvasEl = document.querySelector('canvas');
        if (content) content.classList.toggle('ps-content-shifted');
        if (canvasEl) canvasEl.classList.toggle('ps-canvas-shifted');
        
        saveWheelState(newIsOpen);
    });

    const resetButtonRoot = document.querySelector('[class*="VibeResetButton_root"]');
    if (resetButtonRoot && resetButtonRoot.parentNode) {
        resetButtonRoot.parentNode.insertBefore(btn, resetButtonRoot.nextSibling);
    } else {
        const metaContainer = document.querySelector('[class*="VibePage_meta"]');
        if (metaContainer) {
            const playerBlock = metaContainer.querySelector('[class*="VibePage_playerBlock"]');
            if (playerBlock) metaContainer.insertBefore(btn, playerBlock);
            else metaContainer.appendChild(btn);
        }
    }
}

let swiperObserver = null;

function startSwiperObserver() {
    if (swiperObserver) swiperObserver.disconnect();
    swiperObserver = new MutationObserver(() => {
        if (isFrozen) return;
        const swiper = document.querySelector('.swiper');
        if (swiper) {
            if (!document.getElementById('ps-custom-settings-btn')) {
                initSwiperToggle();
            } else {
                const meta = document.querySelector('[class*="VibePage_meta"]');
                const canvas = document.querySelector('canvas');
                const savedOpen = loadWheelState();
                applyWheelState(swiper, meta, canvas, savedOpen);
            }
        }
    });
    swiperObserver.observe(document.body, { childList: true, subtree: true });
}

let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
    if (isFrozen) return;
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(() => {
            if (isFrozen) return;
            const swiper = document.querySelector('.swiper');
            if (swiper && !document.getElementById('ps-custom-settings-btn')) {
                initSwiperToggle();
            } else if (swiper) {
                const meta = document.querySelector('[class*="VibePage_meta"]');
                const canvas = document.querySelector('canvas');
                const savedOpen = loadWheelState();
                applyWheelState(swiper, meta, canvas, savedOpen);
            }
        }, 500);
    }
});

function startAddon() {
    canvasObserver.observe(document.body, { childList: true, subtree: true });
    coverObserver.observe(document.body, { childList: true, subtree: true });
    
    if (!isFrozen && moveCanvasToRoot() && currentSettings && Object.keys(currentSettings).length > 0) {
        applyAll(currentSettings);
        centerCanvas();
    }

    window.addEventListener('resize', () => {
        if (!isFrozen) centerCanvas();
    });
    setTimeout(() => { if (!isFrozen) centerCanvas(); }, 2000);
    setTimeout(() => {
        if (!isFrozen && currentSettings && Object.keys(currentSettings).length > 0) {
            applyAll(currentSettings);
            centerCanvas();
        }
    }, 1500);

    startSwiperObserver();
    urlObserver.observe(document, { subtree: true, childList: true });
}

function freeze() {
    if (isFrozen) return;
    isFrozen = true;
    console.log('[MWT] Заморозка активности');
}

function unfreeze() {
    if (!isFrozen) return;
    isFrozen = false;
    console.log('[MWT] Разморозка');
    if (settingsApi) {
        const s = settingsApi.getCurrent() || {};
        currentSettings = s;
        applyAll(currentSettings);
    }
    centerCanvas();
    const swiper = document.querySelector('.swiper');
    if (swiper && !document.getElementById('ps-custom-settings-btn')) {
        initSwiperToggle();
    }
}

// ========== ЗАМОРОЗКА ПРИ СВОРАЧИВАНИИ ==========
document.addEventListener('visibilitychange', () => {
    if (document.hidden) freeze(); else unfreeze();
});

function initSettings() {
    if (!window.pulsesyncApi) {
        setTimeout(initSettings, 500);
        return;
    }
    const api = window.pulsesyncApi.getSettings(ADDON_NAME);
    if (!api || typeof api.onChange !== 'function') {
        setTimeout(initSettings, 1000);
        return;
    }
    settingsApi = api;
    const s = api.getCurrent() || {};
    currentSettings = s;
    applyAll(currentSettings);
    api.onChange((newSettings) => {
        currentSettings = newSettings || {};
        applyAll(currentSettings);
    });
    console.log('[MWT] Settings API ready');
    startAddon();
}

function waitForPlayer(callback) {
    if (!window.pulsesyncApi) {
        setTimeout(() => waitForPlayer(callback), 200);
        return;
    }
    if (typeof window.pulsesyncApi._waitForPlayer === 'function') {
        console.log('[MWT] Ожидание PLAYER_READY...');
        window.pulsesyncApi._waitForPlayer(() => {
            console.log('[MWT] PLAYER_READY получен, дополнительная пауза 1.5 сек');
            setTimeout(callback, 1500);  // даём плееру устаканиться
        });
        return;
    }
    if (window.Theme) {
        try {
            const theme = new Theme(ADDON_NAME);
            theme.player.on('ready', () => {
                console.log('[MWT] PLAYER_READY через Theme');
                setTimeout(callback, 1500);
            });
            return;
        } catch (e) {}
    }
    console.warn('[MWT] PLAYER_READY не отслежен, запуск через 3 сек');
    setTimeout(callback, 3000);
}

waitForPlayer(initSettings);