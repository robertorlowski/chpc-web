// Router /api (montowany w core/app.ts po resolveDeviceContext): trasy wspólne
// i routery modułów. Pełna lista endpointów: CLAUDE.md, punkt 8.
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
// ręczne dodanie (test E2E); klient go nie używa, sterowniki rejestrują się same
router.post('/devices', addDevice)
router.post('/devices/register', registerDeviceEntry)
router.put('/devices/:rootId', updateDevice)
router.put('/devices/:rootId/default', updateDefaultDevice)
router.get('/device/properties', getProperties)
router.put('/device/properties', updateProperties)

router.get('/temperature', getTemperature)

// Moduły nie sprawdzają rodzaju urządzenia: np. /hp/add z rootId hydroforu
// zostanie przyjęte. Rozdział rodzajów jest po stronie sterowników i klienta.
router.use(heatPumpRoutes)
router.use(waterPressureTankRoutes)

export default router
