import express from 'express'
import {
  addWaterMeter, addWaterPressure, deleteWaterMeter, getWaterMeter, getWaterMeterSummaryEntry,
  getWaterPressureRunList, getWaterPressureSummaryEntry, updateWaterPressureSettings,
} from './controllers/water-pressure.controller'

// Hydrofor: wysyłka sterownika, czas kompresora, uruchomienia, podsumowania i wodomierz.
const router = express.Router()

router.post('/water-pressure/add', addWaterPressure)
router.put('/water-pressure/settings', updateWaterPressureSettings)
router.get('/water-pressure/runs', getWaterPressureRunList)
router.get('/water-pressure/summary', getWaterPressureSummaryEntry)
router.get('/water-pressure/meter', getWaterMeter)
router.post('/water-pressure/meter', addWaterMeter)
router.delete('/water-pressure/meter/:id', deleteWaterMeter)
router.get('/water-pressure/meter/summary', getWaterMeterSummaryEntry)

export default router
