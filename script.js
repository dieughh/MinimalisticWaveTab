(function(){
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
    let isFrozen = false;
    let layoutFrame = 0;

    const SWIPER_HIDDEN_CLASS = 'ps-swiper-hidden-left';
    const STORAGE_KEY = 'ps_wheel_open';

    // ============================================================
    // ДИНАМИЧЕСКАЯ АДАПТАЦИЯ
    // ============================================================
    const BASE_WHEEL_WIDTH = 600;
    const OVERLAY_THRESHOLD = 750;
    const SIDE_GAP = 24;
    const MIN_CONTENT_WIDTH = 560;
    const OVERLAY_SHIFT_MIN = 78;
    const OVERLAY_SHIFT_MAX = 142;

    function getOverlayContentShift(rootWidth, wheelWidth) {
        const byWheel = Math.round(wheelWidth * 0.36);
        const byWindow = Math.round(rootWidth * 0.15);
        return clampNumber(Math.min(byWheel, byWindow), OVERLAY_SHIFT_MIN, OVERLAY_SHIFT_MAX);
    }

    function getRoot() {
        return document.querySelector('[class*="VibePage_root"]');
    }

    function getMeta() {
        return document.querySelector('[class*="VibePage_meta"]');
    }

    function getWheelElement() {
        const root = getRoot();

        if (root) {
            const wheelInRoot = root.querySelector('.swiper[class*="VibePage_wheel"], .swiper.VibePage_wheel__E_p8_');
            if (wheelInRoot) return wheelInRoot;

            const anySwiperInRoot = root.querySelector('.swiper');
            if (anySwiperInRoot) return anySwiperInRoot;
        }

        return document.querySelector('.swiper[class*="VibePage_wheel"], .swiper.VibePage_wheel__E_p8_, .swiper');
    }

    function getAnimationElement() {
        let el = document.querySelector('canvas');
        if (el) return el;

        el = document.querySelector('[class*="VibeWidgetAnimation_root"]');
        return el;
    }

    function isLiteAnimationElement(el) {
        return !!(
            el &&
            el.tagName !== 'CANVAS' &&
            typeof el.matches === 'function' &&
            el.matches('[class*="VibeWidgetAnimation_root"]')
        );
    }

    function clampNumber(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function readNumberSetting(settings, keys, fallback) {
        for (const key of keys) {
            if (!settings || typeof settings[key] === 'undefined') continue;
            const raw = unwrapSetting(settings[key], undefined);
            const value = Number(raw);
            if (Number.isFinite(value)) return value;
        }
        return fallback;
    }

    function isOverlayMode(rootWidth) {
        const width = typeof rootWidth === 'number' && rootWidth > 0
            ? rootWidth
            : window.innerWidth;

        return width < OVERLAY_THRESHOLD;
    }

    function isWheelOpen(swiper) {
        return !!swiper && !swiper.classList.contains(SWIPER_HIDDEN_CLASS);
    }

    function scheduleLayout() {
        if (isFrozen) return;

        if (layoutFrame) {
            cancelAnimationFrame(layoutFrame);
        }

        layoutFrame = requestAnimationFrame(() => {
            layoutFrame = 0;
            updateLayout();
        });
    }

    function scheduleLayoutBurst() {
        if (isFrozen) return;

        // Важно для открытия/закрытия колеса: meta двигается через CSS transition.
        // Одного requestAnimationFrame мало — getBoundingClientRect() видит старую
        // или промежуточную позицию, поэтому волна правильно центрируется только
        // после нового события вроде сворачивания/разворачивания окна.
        scheduleLayout();
        [40, 90, 160, 240, 340, 460].forEach((delay) => {
            setTimeout(() => {
                if (!isFrozen) scheduleLayout();
            }, delay);
        });
    }

    function saveWheelState(isOpen) {
        localStorage.setItem(STORAGE_KEY, isOpen ? 'true' : 'false');
    }

    function loadWheelState() {
        return localStorage.getItem(STORAGE_KEY) === 'true';
    }

    function applyWheelState(swiper, content, animEl, isOpen) {
        if (!swiper) return;

        swiper.classList.toggle(SWIPER_HIDDEN_CLASS, !isOpen);

        if (content) {
            content.classList.toggle('ps-content-shifted', isOpen);
        }

        if (animEl) {
            animEl.classList.toggle('ps-canvas-shifted', isOpen);
        }

        scheduleLayoutBurst();
    }

    function resetLayoutStyles(swiper, meta) {
        if (meta) {
            meta.classList.remove('ps-content-shifted');
            meta.style.marginLeft = '';
            meta.style.width = '';
            meta.style.maxWidth = '';
            meta.style.paddingLeft = '';
            meta.style.paddingRight = '';
            meta.style.transform = '';
            meta.style.transformOrigin = '';
            meta.removeAttribute('data-ps-layout-mode');
        }

        if (swiper) {
            swiper.style.width = '';
            swiper.style.maxWidth = '';
            swiper.style.position = '';
            swiper.style.zIndex = '';
            swiper.style.transform = '';
        }

        const root = getRoot();
        if (root) {
            root.style.removeProperty('--ps-wheel-width');
            root.style.removeProperty('--ps-wheel-max-width');
            root.style.removeProperty('--ps-overlay-content-shift');
        }
    }

    function applyAll(s) {
        if (isFrozen) return;

        const playerWidth = unwrapSetting(s.playerWidth, 100);
        const coverOffsetX = unwrapSetting(s.coverOffsetX, 0);

        document.documentElement.style.setProperty('--ps-player-width', playerWidth + '%');

        const cover = document.querySelector('[class*="AlbumCover_root"]');
        if (cover) {
            cover.style.transform = `translateX(${coverOffsetX}px)`;
        }

        const animEl = getAnimationElement();
        if (animEl) {
            animEl.style.display = unwrapSetting(s.animationEnabled, true) ? '' : 'none';
        }

        scheduleLayout();
    }

    function centerCanvas() {
        if (isFrozen) return;

        const animEl = getAnimationElement();
        if (!animEl) return;

        if (!currentSettings || !unwrapSetting(currentSettings.animationEnabled, true)) {
            animEl.style.display = 'none';
            return;
        }

        const root = getRoot();
        if (!root) return;

        const rootRect = root.getBoundingClientRect();
        if (rootRect.width === 0 || rootRect.height === 0) return;

        const meta = getMeta();
        const swiper = getWheelElement();
        const wheelOpen = isWheelOpen(swiper);
        const layoutMode = meta ? meta.getAttribute('data-ps-layout-mode') : '';
        const isLiteModeAnimation = isLiteAnimationElement(animEl);

        /*
          Canvas и Lite Mode ведут себя по-разному.
          Canvas — это большая живая анимация, ей нормально использовать animationScale.
          Lite Mode — это статичная картинка. Если растягивать её как canvas
          (rootWidth * animationScale), она превращается в огромную плашку на весь экран.
        */
        const useMetaRect = !!(
            meta &&
            wheelOpen &&
            (layoutMode === 'side' || layoutMode === 'overlay-shift')
        );
        const frameRect = useMetaRect ? meta.getBoundingClientRect() : rootRect;

        if (frameRect.width === 0 || frameRect.height === 0) return;

        const topOffset = unwrapSetting(currentSettings.animationTopOffset, 0);
        const leftOffset = unwrapSetting(currentSettings.animationLeftOffset, 0);

        const scale = readNumberSetting(currentSettings, ['animationScale'], 1);
        let size;

        if (isLiteModeAnimation) {
            /*
              Lite Mode тоже должен слушать общий слайдер `animationScale`
              из handleEvents.json. Отличие только в базовом коэффициенте:
              статичная картинка меньше canvas, чтобы при scale = 1 она не
              раздувалась на весь экран.
            */
            const liteBaseScale = 0.78;
            const base = Math.min(frameRect.width, rootRect.height);
            const minSize = Math.min(260, base);
            const maxSize = Math.max(
                minSize,
                Math.min(1400, rootRect.height * 1.55, rootRect.width * 0.92)
            );

            size = clampNumber(base * liteBaseScale * scale, minSize, maxSize);
        } else {
            size = Math.max(frameRect.width, rootRect.height) * scale;
        }

        const localLeft = useMetaRect ? (frameRect.left - rootRect.left) : 0;
        const centerX = localLeft + (frameRect.width - size) / 2 + leftOffset;
        const centerY = (rootRect.height - size) / 2 + topOffset;

        animEl.classList.toggle('ps-lite-animation', isLiteModeAnimation);
        animEl.style.display = '';
        animEl.style.position = 'absolute';
        animEl.style.setProperty('width', size + 'px', 'important');
        animEl.style.setProperty('height', size + 'px', 'important');
        animEl.style.zIndex = '0';
        animEl.style.pointerEvents = 'none';

        if (isLiteModeAnimation) {
            /*
              У Lite-картинки в CSS стоит transform: none !important, как в старой версии.
              Поэтому позиционируем её через left/top, а не через translate().
            */
            animEl.style.setProperty('left', centerX + 'px', 'important');
            animEl.style.setProperty('top', centerY + 'px', 'important');
            animEl.style.setProperty('transform', 'none', 'important');
        } else {
            animEl.style.setProperty('left', '0px', 'important');
            animEl.style.setProperty('top', '0px', 'important');
            animEl.style.setProperty('transform', `translate(${centerX}px, ${centerY}px)`, 'important');
        }

        if (animEl.tagName === 'CANVAS') {
            animEl.style.objectFit = 'cover';
        } else if (isLiteModeAnimation) {
            animEl.style.margin = '0';
            animEl.style.padding = '0';
            animEl.style.boxSizing = 'border-box';
            animEl.style.alignItems = 'normal';
            animEl.style.justifyContent = 'normal';
            animEl.style.overflow = 'visible';

            const img = animEl.querySelector('img');
            if (img) {
                img.style.display = 'block';
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'contain';
                img.style.margin = '0';
                img.style.padding = '0';
                img.style.pointerEvents = 'none';
            }
        }
    }

    function moveAnimationToRoot() {
        if (isFrozen) return false;

        const animEl = getAnimationElement();
        if (!animEl) return false;

        const root = getRoot();
        if (root && animEl.parentElement !== root) {
            root.insertBefore(animEl, root.firstChild);
            return true;
        }

        return false;
    }

    function updateLayout() {
        if (isFrozen) return;

        const swiper = getWheelElement();
        const meta = getMeta();
        const root = getRoot();

        if (!root) return;

        moveAnimationToRoot();

        if (!swiper || !meta) {
            centerCanvas();
            return;
        }

        const rootRect = root.getBoundingClientRect();
        const rootWidth = rootRect.width || window.innerWidth;
        const open = isWheelOpen(swiper);

        if (!open) {
            resetLayoutStyles(swiper, meta);
            centerCanvas();
            return;
        }

        meta.classList.add('ps-content-shifted');

        let wheelWidth = BASE_WHEEL_WIDTH;
        if (rootWidth < 1100) wheelWidth = 420;
        if (rootWidth < 960) wheelWidth = 340;

        wheelWidth = Math.min(wheelWidth, Math.floor(rootWidth * 0.42));
        wheelWidth = Math.max(280, wheelWidth);

        const needOverlay =
            isOverlayMode(rootWidth) ||
            (rootWidth - wheelWidth - SIDE_GAP < MIN_CONTENT_WIDTH);

        swiper.style.position = 'absolute';
        swiper.style.transform = '';
        root.style.setProperty('--ps-wheel-width', wheelWidth + 'px');

        if (needOverlay) {
            const overlayWidth = Math.min(320, Math.floor(rootWidth * 0.8));
            const contentShift = getOverlayContentShift(rootWidth, overlayWidth);

            root.style.setProperty('--ps-wheel-width', overlayWidth + 'px');
            root.style.setProperty('--ps-wheel-max-width', '80vw');
            root.style.setProperty('--ps-overlay-content-shift', contentShift + 'px');

            swiper.style.width = overlayWidth + 'px';
            swiper.style.maxWidth = '80vw';
            swiper.style.zIndex = '200';

            /*
              Маленькое окно не должно оставаться по центру: колесо лежит поверх,
              но вся правая область всё равно мягко уезжает вправо через transform.
              Так ширина плеера не схлопывается, а волна следует за блоком.
            */
            meta.setAttribute('data-ps-layout-mode', 'overlay-shift');
            meta.style.marginLeft = '0px';
            meta.style.width = '100%';
            meta.style.maxWidth = '100%';
            meta.style.paddingLeft = '16px';
            meta.style.paddingRight = '16px';
            meta.style.transform = `translateX(${contentShift}px)`;
            meta.style.transformOrigin = 'center center';
        } else {
            const occupied = wheelWidth + SIDE_GAP;

            root.style.setProperty('--ps-wheel-width', wheelWidth + 'px');
            root.style.setProperty('--ps-wheel-max-width', '90vw');

            swiper.style.width = wheelWidth + 'px';
            swiper.style.maxWidth = '90vw';
            swiper.style.zIndex = '100';

            meta.setAttribute('data-ps-layout-mode', 'side');
            meta.style.marginLeft = occupied + 'px';
            meta.style.width = `calc(100% - ${occupied}px)`;
            meta.style.maxWidth = `calc(100% - ${occupied}px)`;
            meta.style.paddingLeft = '16px';
            meta.style.paddingRight = '16px';
            meta.style.transform = '';
            meta.style.transformOrigin = '';
        }

        centerCanvas();
    }

    const globalObserver = new MutationObserver(() => {
        if (isFrozen) return;

        const root = getRoot();
        if (!root) return;

        moveAnimationToRoot();

        const swiper = getWheelElement();
        if (swiper) {
            if (!document.getElementById('ps-custom-settings-btn')) {
                initSwiperToggle();
            }
        }

        scheduleLayout();
    });

    const coverObserver = new MutationObserver(() => {
        if (isFrozen) return;

        const cover = document.querySelector('[class*="AlbumCover_root"]');
        if (cover && currentSettings && Object.keys(currentSettings).length > 0) {
            applyAll(currentSettings);
            coverObserver.disconnect();
        }
    });

    function initSwiperToggle() {
        if (isFrozen) return;

        const swiper = getWheelElement();
        if (!swiper) return;

        const meta = getMeta();
        const animEl = getAnimationElement();

        const savedOpen = loadWheelState();
        applyWheelState(swiper, meta, animEl, savedOpen);

        if (document.getElementById('ps-custom-settings-btn')) {
            scheduleLayout();
            return;
        }

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

            const currentSwiper = getWheelElement();
            if (!currentSwiper) return;

            currentSwiper.classList.toggle(SWIPER_HIDDEN_CLASS);

            const content = getMeta();
            const animElNow = getAnimationElement();
            const open = isWheelOpen(currentSwiper);

            if (content) {
                content.classList.toggle('ps-content-shifted', open);
            }

            if (animElNow) {
                animElNow.classList.toggle('ps-canvas-shifted', open);
            }

            saveWheelState(open);
            scheduleLayoutBurst();
        });

        const resetButtonRoot = document.querySelector('[class*="VibeResetButton_root"]');
        if (resetButtonRoot && resetButtonRoot.parentNode) {
            resetButtonRoot.parentNode.insertBefore(btn, resetButtonRoot.nextSibling);
        } else {
            const metaContainer = getMeta();
            if (metaContainer) {
                const playerBlock = metaContainer.querySelector('[class*="VibePage_playerBlock"]');
                if (playerBlock) {
                    metaContainer.insertBefore(btn, playerBlock);
                } else {
                    metaContainer.appendChild(btn);
                }
            }
        }

        scheduleLayout();
    }

    let swiperObserver = null;

    function startSwiperObserver() {
        if (swiperObserver) swiperObserver.disconnect();

        swiperObserver = new MutationObserver(() => {
            if (isFrozen) return;

            const swiper = getWheelElement();
            if (!swiper) return;

            const meta = getMeta();
            const animEl = getAnimationElement();
            const savedOpen = loadWheelState();

            applyWheelState(swiper, meta, animEl, savedOpen);

            if (!document.getElementById('ps-custom-settings-btn')) {
                initSwiperToggle();
            } else {
                scheduleLayout();
            }
        });

        swiperObserver.observe(document.body, { childList: true, subtree: true });
    }

    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
        if (isFrozen) return;

        const url = location.href;
        if (url === lastUrl) return;

        lastUrl = url;

        setTimeout(() => {
            if (isFrozen) return;

            const root = getRoot();
            if (root) {
                moveAnimationToRoot();

                if (currentSettings && Object.keys(currentSettings).length > 0) {
                    applyAll(currentSettings);
                }
            }

            const swiper = getWheelElement();
            if (swiper && !document.getElementById('ps-custom-settings-btn')) {
                initSwiperToggle();
            } else if (swiper) {
                const meta = getMeta();
                const animEl = getAnimationElement();
                const savedOpen = loadWheelState();
                applyWheelState(swiper, meta, animEl, savedOpen);
            }

            scheduleLayout();
        }, 300);
    });

    function startAddon() {
        globalObserver.observe(document.body, { childList: true, subtree: true });
        coverObserver.observe(document.body, { childList: true, subtree: true });

        if (!isFrozen) {
            moveAnimationToRoot();

            if (currentSettings && Object.keys(currentSettings).length > 0) {
                applyAll(currentSettings);
            }

            initSwiperToggle();
            scheduleLayout();
        }

        window.addEventListener('resize', () => {
            if (!isFrozen) {
                scheduleLayoutBurst();
            }
        });

        document.addEventListener('transitionend', (event) => {
            if (isFrozen) return;
            const target = event.target;
            if (!target || typeof target.matches !== 'function') return;

            if (
                target.matches('[class*="VibePage_meta"]') ||
                target.matches('.swiper[class*="VibePage_wheel"], .swiper.VibePage_wheel__E_p8_')
            ) {
                scheduleLayout();
            }
        }, true);

        setTimeout(() => {
            if (!isFrozen) scheduleLayout();
        }, 500);

        setTimeout(() => {
            if (!isFrozen) scheduleLayout();
        }, 1500);

        setTimeout(() => {
            if (!isFrozen) scheduleLayout();
        }, 2500);

        startSwiperObserver();
        urlObserver.observe(document, { subtree: true, childList: true });
    }

    function freeze() {
        if (isFrozen) return;

        isFrozen = true;

        if (layoutFrame) {
            cancelAnimationFrame(layoutFrame);
            layoutFrame = 0;
        }

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

        const swiper = getWheelElement();
        if (swiper && !document.getElementById('ps-custom-settings-btn')) {
            initSwiperToggle();
        }

        scheduleLayout();
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            freeze();
        } else {
            unfreeze();
        }
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
                setTimeout(callback, 1500);
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
})();
