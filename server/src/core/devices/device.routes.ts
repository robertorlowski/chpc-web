import express from 'express'
import { addDevice, getDevices, getProperties, registerDeviceEntry, updateDefaultDevice, updateDevice, updateProperties } from './device.controller'

// Urządzenia wszystkich rodzajów: lista, zgłoszenie sterownika, nazwa,
// sterownik domyślny i ustawienia (properties).
const router = express.Router()

router.get('/devices', getDevices)
router.post('/devices', addDevice)
router.post('/devices/register', registerDeviceEntry)
router.put('/devices/:rootId', updateDevice)
router.put('/devices/:rootId/default', updateDefaultDevice)
router.get('/device/properties', getProperties)
router.put('/device/properties', updateProperties)

export default router
