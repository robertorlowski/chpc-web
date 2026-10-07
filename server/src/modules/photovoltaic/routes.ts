import express from 'express'
import {
  getPvCurrent, getPvDay, getPvInverters, getPvReadings, getPvSummary,
} from './controllers/photovoltaic.controller'

// Fotowoltaika (rodzaj „photovoltaic”): widoki dla aplikacji, tylko odczyt (rootId urządzenia
// fotowoltaiki; dane z odczytów sterownika co o tym samym SN).
const router = express.Router()

router.get('/photovoltaic/current', getPvCurrent)
router.get('/photovoltaic/day', getPvDay)
router.get('/photovoltaic/summary', getPvSummary)
router.get('/photovoltaic/readings', getPvReadings)
router.get('/photovoltaic/inverters', getPvInverters)

export default router
