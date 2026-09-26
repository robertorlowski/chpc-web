import express from 'express'

import { getHp, addHp, getHpAll, getHpAvailableDates, clearHp, getHp4Day, getHpMonthlySummary, getLastError } from './../controllers/hp.controller'
import { getSettings, setSettings } from './../controllers/settings.controller'
import { getAndClearOperation, getOperation, prepareOperation, setOperation, setOperationAction } from '../controllers/operation.controller'
import { getTemperature } from '../controllers/meteo.controller'
import { createScheduleEntry, deleteScheduleEntry, getCurrentScheduleEntry, getScheduleEntries, updateScheduleEntry } from '../controllers/schedule.controller'
import { addDevice, getDevices, getProperties, registerDeviceEntry, updateDevice, updateProperties } from '../controllers/device.controller'

const router = express.Router()

router.get('/devices', getDevices)
router.post('/devices', addDevice)
router.post('/devices/register', registerDeviceEntry)
router.put('/devices/:rootId', updateDevice)
router.get('/device/properties', getProperties)
router.put('/device/properties', updateProperties)

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

router.get('/settings', getSettings)
router.post('/settings/set', setSettings)

router.get('/schedules', getScheduleEntries)
router.get('/schedules/current', getCurrentScheduleEntry)
router.post('/schedules', createScheduleEntry)
router.put('/schedules/:id', updateScheduleEntry)
router.delete('/schedules/:id', deleteScheduleEntry)

router.get('/temperature', getTemperature)

export default router
