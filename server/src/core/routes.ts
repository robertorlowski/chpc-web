// Router /api (montowany w core/app.ts po resolveDeviceContext): trasy wspólne
// i routery modułów. Pełna lista endpointów: CLAUDE.md, punkt 8.
import express from 'express'

import { addDevice, getDevices, getProperties, registerDeviceEntry, updateDefaultDevice, updateDevice, updateProperties } from './controllers/device.controller'
import { deleteFirmware, downloadFirmware, getFirmware, updateFirmwareOffer, uploadFirmware } from './controllers/firmware.controller'
import { getTemperature } from './controllers/meteo.controller'
import heatPumpRoutes from '../modules/heat-pump/routes'
import waterPressureTankRoutes from '../modules/water-pressure-tank/routes'
import pelletBoilerPelux200Routes from '../modules/pellet-boiler-pelux200/routes'

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

// Firmware sterowników przez sieć (OTA): oferta, wgranie pliku, pobranie.
// Plik .bin to surowa treść żądania (application/octet-stream), bez multipart.
router.get('/firmware/:deviceType', getFirmware)
router.put('/firmware/:deviceType', updateFirmwareOffer)
router.put('/firmware/:deviceType/:version', express.raw({ type: 'application/octet-stream', limit: '2mb' }), uploadFirmware)
router.get('/firmware/:deviceType/:version', downloadFirmware)
router.delete('/firmware/:deviceType/:version', deleteFirmware)

router.get('/temperature', getTemperature)

// Moduły nie sprawdzają rodzaju urządzenia: np. /hp/add z rootId hydroforu
// zostanie przyjęte. Rozdział rodzajów jest po stronie sterowników i klienta.
router.use(heatPumpRoutes)
router.use(waterPressureTankRoutes)
router.use(pelletBoilerPelux200Routes)

export default router
