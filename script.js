const ADDON_NAME = 'Minimalistic Wave Tab';

// --- Хелперы PulseSync ---
function unwrapSetting(entry, fallback) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        if (typeof entry.value !== 'undefined') return entry.value;
        if (typeof entry.default !== 'undefined') return entry.default;
    }
    return typeof entry !== 'undefined' ? entry : fallback;
}

function getAddonSettings(addonName) {
    return window.pulsesyncApi?.getSettings(addonName) ?? {
        getCurrent: () => ({}),
        onChange: () => () => {},
    };
}

const store = getAddonSettings(ADDON_NAME);
let settings = store.getCurrent();

// Применяем CSS-переменные и управляем видимостью canvas
function applySettings(s) {
    const playerWidth = unwrapSetting(s.playerWidth, 100);
    const animEnabled = unwrapSetting(s.animationEnabled, true);
    const animScale = unwrapSetting(s.animationScale, 1.5);
    const topOffset = unwrapSetting(s.animationTopOffset, 0);
    const leftOffset = unwrapSetting(s.animationLeftOffset, 0);

    document.documentElement.style.setProperty('--ps-player-width', playerWidth + '%');
    document.documentElement.style.setProperty('--ps-animation-scale', animScale);
    document.documentElement.style.setProperty('--ps-animation-top-offset', topOffset + 'px');
    document.documentElement.style.setProperty('--ps-animation-left-offset', leftOffset + 'px');

    // Сразу применяем видимость и позицию к canvas, если он существует
    const canvas = document.querySelector('canvas');
    if (canvas) {
        if (animEnabled) {
            canvas.style.display = '';
            centerCanvas(canvas);
        } else {
            canvas.style.display = 'none';
        }
    }
}

applySettings(settings);

store.onChange((newSettings) => {
    settings = newSettings;
    applySettings(settings);
});

// --- Центрирование canvas (учитываем смещения по горизонтали и вертикали) ---
function centerCanvas() {
    const root = document.querySelector('[class*="VibePage_root"]');
    const canvas = document.querySelector('canvas');
    if (!root || !canvas) return;

    const enabled = unwrapSetting(settings.animationEnabled, true);
    if (!enabled) {
        canvas.style.display = 'none';
        return;
    }
    canvas.style.display = '';

    const rootRect = root.getBoundingClientRect();
    const scale = unwrapSetting(settings.animationScale, 1.5);
    const size = Math.max(rootRect.width, rootRect.height) * scale;
    const topOffset = unwrapSetting(settings.animationTopOffset, 0);
    const leftOffset = unwrapSetting(settings.animationLeftOffset, 0);

    canvas.style.position = 'absolute';
    canvas.style.left = (rootRect.width - size) / 2 + leftOffset + 'px'; // добавляем горизонтальное смещение
    canvas.style.top = (rootRect.height - size) / 2 + topOffset + 'px';   // добавляем вертикальное смещение
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.style.zIndex = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.objectFit = 'cover';
}

// --- Отслеживание появления canvas (не отключаем наблюдатель) ---
const canvasObserver = new MutationObserver(() => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
        const root = document.querySelector('[class*="VibePage_root"]');
        if (root && canvas.parentElement !== root) {
            root.insertBefore(canvas, root.firstChild);
        }
        centerCanvas();
    }
});
canvasObserver.observe(document.body, { childList: true, subtree: true });

window.addEventListener('resize', centerCanvas);

// Первичный вызов, если canvas уже есть
(function initialCheck() {
    const canvas = document.querySelector('canvas');
    if (canvas) {
        const root = document.querySelector('[class*="VibePage_root"]');
        if (root && canvas.parentElement !== root) {
            root.insertBefore(canvas, root.firstChild);
        }
        centerCanvas();
    }
})();