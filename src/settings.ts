import { defineAddonSettings } from '@pulsesync/addon-sdk'

export const settings = defineAddonSettings([
    {
        title: 'Плеер',
        items: {
            playerWidth: {
                type: 'number',
                name: 'Ширина плеера (%)',
                description: 'Ширина VibePlayerBar_progress в процентах от родителя.',
                min: 20,
                max: 100,
                step: 1,
                default: 100,
            },
            coverOffsetX: {
                type: 'number',
                name: 'Смещение кнопок по горизонтали (px)',
                description: 'Сдвиг кнопок паузы/трека влево/вправо.',
                min: -200,
                max: 200,
                step: 10,
                default: 0,
            },
        },
    },
    {
        title: 'Анимация',
        items: {
            animationScale: {
                type: 'number',
                name: 'Размер анимации',
                description: 'Масштаб canvas относительно родителя (1.0 = 100%, 1.5 = 150%).',
                min: 0.5,
                max: 2,
                step: 0.1,
                default: 1,
            },
            animationEnabled: {
                type: 'boolean',
                name: 'Показывать анимацию',
                description: 'Включает или отключает фоновую анимацию волны.',
                default: true,
            },
            animationLeftOffset: {
                type: 'number',
                name: 'Смещение по горизонтали (px)',
                description: 'Сдвиг анимации влево/вправо. Отрицательные значения — влево.',
                min: -250,
                max: 250,
                step: 10,
                default: 0,
            },
            animationTopOffset: {
                type: 'number',
                name: 'Смещение по вертикали (px)',
                description: 'Сдвиг анимации вверх/вниз. Отрицательные значения — вверх.',
                min: -250,
                max: 250,
                step: 10,
                default: 0,
            },
        },
    },
])

export type WaveSettings = typeof settings.defaults
