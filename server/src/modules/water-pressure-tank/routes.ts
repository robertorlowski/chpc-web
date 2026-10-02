import express from 'express'
import {
  addWaterMeter, addWaterPressureTank, deleteWaterMeter, getWaterFlow, getWaterMeter, getWaterMeterSummaryEntry,
  getWaterPressureTankRunList, getWaterPressureTankSummaryEntry, updateWaterPressureTankSettings,
} from './controllers/water-pressure-tank.controller'

// Hydrofor: wysyłka sterownika, czas kompresora, uruchomienia, podsumowania, przepływ i wodomierz.
const router = express.Router()

// add i settings woła sterownik (wystarczy ?deviceId=, core/middleware/device-context.ts)
router.post('/water-pressure-tank/add', addWaterPressureTank)
router.put('/water-pressure-tank/settings', updateWaterPressureTankSettings)
router.get('/water-pressure-tank/runs', getWaterPressureTankRunList)
router.get('/water-pressure-tank/summary', getWaterPressureTankSummaryEntry)
router.get('/water-pressure-tank/flow', getWaterFlow)
router.get('/water-pressure-tank/meter', getWaterMeter)
router.post('/water-pressure-tank/meter', addWaterMeter)
router.delete('/water-pressure-tank/meter/:id', deleteWaterMeter)
router.get('/water-pressure-tank/meter/summary', getWaterMeterSummaryEntry)

export default router
