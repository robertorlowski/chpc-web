import express from 'express'

import { getHp, addHp, getHpAll, clearHp, getHp4Day, getHpMonthlySummary } from './../controllers/hp.controller'
import { getSettings, setSettings } from './../controllers/settings.controller'
import { getAndClearOperation, getOperation, prepareOperation, setOperation } from '../controllers/operation.controller'
import { getTemperature } from '../controllers/meteo.controller'
import { createScheduleEntry, deleteScheduleEntry, getScheduleEntries, updateScheduleEntry } from '../controllers/schedule.controller'
import { addDevice, getDevices, getProperties, updateProperties } from '../controllers/device.controller'

const router = express.Router()

router.get('/devices', getDevices)
router.post('/devices', addDevice)
router.get('/device/properties', getProperties)
router.put('/device/properties', updateProperties)

router.get('/operation', prepareOperation);
router.post('/operation/set', setOperation);
router.get('/operation/get', getOperation);
router.get('/operation/getAndClear', getAndClearOperation);

router.get('/hp', getHp)
router.get('/hp/all', getHpAll)
router.get('/hp/4day', getHp4Day)
router.get('/hp/monthly-summary', getHpMonthlySummary)
router.post('/hp/add', addHp)
router.post('/hp/clear', clearHp)

router.get('/settings', getSettings)
router.post('/settings/set', setSettings)

router.get('/schedules', getScheduleEntries)
router.post('/schedules', createScheduleEntry)
router.put('/schedules/:id', updateScheduleEntry)
router.delete('/schedules/:id', deleteScheduleEntry)

router.get('/temperature', getTemperature)

export default router
