import express from 'express'

import deviceRoutes from './devices/device.routes'
import { getTemperature } from './meteo.controller'
import heatPumpRoutes from '../modules/heat-pump/routes'
import waterPressureRoutes from '../modules/water-pressure/routes'

// Trasy /api: wspólne (urządzenia, temperatura zewnętrzna) i moduły rodzajów sterowników.
const router = express.Router()

router.use(deviceRoutes)
router.get('/temperature', getTemperature)

router.use(heatPumpRoutes)
router.use(waterPressureRoutes)

export default router
