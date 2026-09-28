import express from 'express'

import { getHp, addHp, getHpAll, getHpAvailableDates, clearHp, getHp4Day, getHpMonthlySummary, getLastError } from './controllers/hp.controller'
import { getSettings, setSettings } from './controllers/settings.controller'
import { getAndClearOperation, getOperation, prepareOperation, setOperation, setOperationAction } from './controllers/operation.controller'
import { createScheduleEntry, deleteScheduleEntry, getCurrentScheduleEntry, getScheduleEntries, updateScheduleEntry } from './controllers/schedule.controller'
import { addPv, getPv, getPvForRange } from './controllers/pv.controller'

// Pompa ciepła (sterownik co): telemetria, PV, operacje, harmonogramy i starsze ustawienia.
const router = express.Router()

// /operation: wartości do formularza Ustawień (z telemetrii); /operation/get i
// /getAndClear: bieżąca operacja z pamięci (getAndClear ją kasuje, więc co jej nie dostanie).
router.get('/operation', prepareOperation);
router.post('/operation/set', setOperation);
router.get('/operation/get', getOperation);
router.get('/operation/getAndClear', getAndClearOperation);
router.post('/operation/action', setOperationAction);

router.get('/hp', getHp)
router.get('/hp/all', getHpAll)
router.get('/hp/dates', getHpAvailableDates)
router.get('/hp/4day', getHp4Day)
router.get('/hp/monthly-summary', getHpMonthlySummary)
router.get('/hp/last-error', getLastError)
router.post('/hp/add', addHp)
router.post('/hp/clear', clearHp)

router.get('/pv', getPv)
router.get('/pv/range', getPvForRange)
router.post('/pv/add', addPv)

// starszy model ustawień czasowych (kolekcja settings); scheduler go nie używa
router.get('/settings', getSettings)
router.post('/settings/set', setSettings)

router.get('/schedules', getScheduleEntries)
router.get('/schedules/current', getCurrentScheduleEntry)
router.post('/schedules', createScheduleEntry)
router.put('/schedules/:id', updateScheduleEntry)
router.delete('/schedules/:id', deleteScheduleEntry)

export default router
