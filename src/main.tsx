import { defineAddon } from '@pulsesync/addon-sdk'
import addonConfig from '../addon.config.mjs'
import { settings } from './settings'
import { startWaveLayout } from './wave-layout'
import './style.css'

export default defineAddon({
    id: addonConfig.id,
    name: addonConfig.name,
    settings,
    start: startWaveLayout,
})
