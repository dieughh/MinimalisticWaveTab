const ADDON_NAME = 'Minimalistic Wave Tab';
const APPLY_INTERVAL = 200;

function unwrapSetting(entry, fallback) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        if (typeof entry.value !== 'undefined') return entry.value;
        if (typeof entry.default !== 'undefined') return entry.default;
    }
    return typeof entry !== 'undefined' ? entry : fallback;
}

let currentSettings = {};

function updateSettings() {
    const store = window.pulsesyncApi?.getSettings(ADDON_NAME);
    if (!store) return;
    const newSettings = store.getCurrent();
    if (JSON.stringify(newSettings) !== JSON.stringify(currentSettings)) {
        currentSettings = newSettings || {};
        applyAll(currentSettings);
    }
}

function applyAll(s) {
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
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    if (!currentSettings || !unwrapSetting(currentSettings.animationEnabled, true)) {
        canvas.style.display = 'none';
        return;
    }
    canvas.style.display = '';

    requestAnimationFrame(() => {
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
    if (moveCanvasToRoot()) {
        canvasObserver.disconnect();
    }
    if (currentSettings && Object.keys(currentSettings).length > 0) {
        applyAll(currentSettings);
        centerCanvas();
    }
});
canvasObserver.observe(document.body, { childList: true, subtree: true });

if (moveCanvasToRoot() && currentSettings && Object.keys(currentSettings).length > 0) {
    applyAll(currentSettings);
    centerCanvas();
}

const coverObserver = new MutationObserver(() => {
    const cover = document.querySelector('[class*="AlbumCover_root"]');
    if (cover && currentSettings && Object.keys(currentSettings).length > 0) {
        applyAll(currentSettings);
        coverObserver.disconnect();
    }
});
coverObserver.observe(document.body, { childList: true, subtree: true });

setInterval(updateSettings, APPLY_INTERVAL);
window.addEventListener('resize', centerCanvas);
setTimeout(centerCanvas, 2000);
setTimeout(() => {
    if (currentSettings && Object.keys(currentSettings).length > 0) {
        applyAll(currentSettings);
        centerCanvas();
    }
}, 1500);

const SWIPER_HIDDEN_CLASS = 'ps-swiper-hidden-left';

function initSwiperToggle() {
    const swiper = document.querySelector('.swiper');
    if (!swiper) return;

    swiper.classList.add(SWIPER_HIDDEN_CLASS);
    const meta = document.querySelector('[class*="VibePage_meta"]');
    const canvas = document.querySelector('canvas');
    if (meta) meta.classList.remove('ps-content-shifted');
    if (canvas) canvas.classList.remove('ps-canvas-shifted');

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
        swiper.classList.toggle(SWIPER_HIDDEN_CLASS);
        const content = document.querySelector('[class*="VibePage_meta"]');
        const canvasEl = document.querySelector('canvas');
        if (content) content.classList.toggle('ps-content-shifted');
        if (canvasEl) canvasEl.classList.toggle('ps-canvas-shifted');
    });

    // НОВОЕ: ищем блок "Моя волна" (VibeResetButton_root)
    const resetButtonRoot = document.querySelector('[class*="VibeResetButton_root"]');
    if (resetButtonRoot && resetButtonRoot.parentNode) {
        // Вставляем кнопку после этого блока
        resetButtonRoot.parentNode.insertBefore(btn, resetButtonRoot.nextSibling);
    } else {
        // fallback: старая логика — вставляем в VibePage_meta перед плеером
        const metaContainer = document.querySelector('[class*="VibePage_meta"]');
        if (metaContainer) {
            const playerBlock = metaContainer.querySelector('[class*="VibePage_playerBlock"]');
            if (playerBlock) metaContainer.insertBefore(btn, playerBlock);
            else metaContainer.appendChild(btn);
        }
    }
}

const swiperObserver = new MutationObserver(() => {
    if (document.querySelector('.swiper')) {
        initSwiperToggle();
        swiperObserver.disconnect();
    }
});
swiperObserver.observe(document.body, { childList: true, subtree: true });

if (document.querySelector('.swiper')) {
    initSwiperToggle();
}

updateSettings();