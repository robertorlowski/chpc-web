import express from 'express'

import { addDevice, getDevices, getProperties, registerDeviceEntry, updateDefaultDevice, updateDevice, updateProperties } from './controllers/device.controller'
import { getTemperature } from './controllers/meteo.controller'
import heatPumpRoutes from '../modules/heat-pump/routes'
import waterPressureTankRoutes from '../modules/water-pressure-tank/routes'

// Trasy /api: wspólne (urządzenia, temperatura zewnętrzna) i moduły rodzajów sterowników.
const router = express.Router()

// Urządzenia wszystkich rodzajów: lista, zgłoszenie sterownika, nazwa,
// sterownik domyślny i ustawienia (properties).
router.get('/devices', getDevices)
router.post('/devices', addDevice)
router.post('/devices/register', registerDeviceEntry)
router.put('/devices/:rootId', updateDevice)
router.put('/devices/:rootId/default', updateDefaultDevice)
router.get('/device/properties', getProperties)
router.put('/device/properties', updateProperties)

router.get('/temperature', getTemperature)

router.use(heatPumpRoutes)
router.use(waterPressureTankRoutes)

export default router
