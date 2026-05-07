function injectStyles() {
    const styles = `
        /* === СКРЫТИЕ ЛИШНЕГО === */
        [class*="WheelDesktop_root"] { display: none !important; }
        [class*="WordsCard_root"] { display: none !important; }
        [class*="VibeArtistCover_cover"] { display: none !important; }
        [class*="VibeDynamicArtists_root"] { display: none !important; }
        img[class*="AlbumCover_cover"] { display: none !important; }
        [class*="AlbumCover_playButtonContainer"] { background-color: transparent !important; }
        [class*="VibePage_hoveredButton"] { opacity: 1 !important; }

        /* === ОСНОВНАЯ СЕТКА === */
        [class*="VibePage_root"] {
            position: relative !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            height: 100% !important;
            overflow: hidden !important;
            grid-template-areas: none !important;
            grid-template-columns: none !important;
            grid-template-rows: none !important;
        }

        [class*="VibePage_meta"] {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            width: 100% !important;
            flex: 1 !important;
            min-height: 0 !important;
            z-index: 1;
        }

        [class*="VibePage_playerBlock"] {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            width: 100% !important;
            margin-top: auto !important;
        }

        /* === ПЛЕЕР === */
        [class*="VibePlayerBar_root"] {
            width: min(28.75rem, 100%) !important;
            position: static !important;
            bottom: auto !important;
            left: auto !important;
            transform: none !important;
        }
        [class*="VibePlayerBar_progress"] { width: 100% !important; }
        [class*="VibePlayerBar_center"] { width: 100% !important; }

        [class*="AlbumCover_root"] {
            position: static !important;
            inset-block-end: auto !important;
            align-self: center !important;
        }

        [class*="VibeResetButton_container"] {
            margin-left: auto !important;
            margin-right: auto !important;
        }

        /* === АНИМАЦИЯ: фон внутри VibePage_root, БЕЗ ОГРАНИЧЕНИЙ РАЗМЕРА CANVAS === */
        [class*="VibeWidgetAnimation_root"] {
            position: absolute !important;
            left: 0 !important;
            top: calc(0px + var(--vibe-animation-shift-y, -70px)) !important;
            width: 100% !important;
            height: 100% !important;
            z-index: 0 !important;
            pointer-events: none !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            transform: none !important;
        }

        /* Убираем ограничения размера canvas – пусть будет как в оригинале */
        [class*="VibeWidgetAnimation_root"] canvas {
            width: 150% !important;
            height: 150% !important;
        }
    `;

    const styleTag = document.createElement('style');
    styleTag.textContent = styles;
    styleTag.setAttribute('data-pulse-sync-vibe-cleaner', '');
    document.head.appendChild(styleTag);
}

function moveAnimation() {
    const observer = new MutationObserver(() => {
        const root = document.querySelector('[class*="VibePage_root"]');
        const anim = document.querySelector('[data-test-id="VIBE_ANIMATION"]');
        if (root && anim && anim.parentElement !== root) {
            root.insertBefore(anim, root.firstChild);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function init() {
    injectStyles();
    moveAnimation();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}