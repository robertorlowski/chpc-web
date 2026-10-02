import express from 'express'
import {
  deleteSwitchSchedule, getSwitchActivations, getSwitchRelays, getSwitchSchedules, postSwitchSchedule,
  postSwitchState, putSwitchMode, putSwitchRelayName, putSwitchSchedule,
} from './controllers/switch.controller'

// Włącznik: stan i polecenia sterownika, tryby przekaźników, nazwy, harmonogramy, włączenia.
const router = express.Router()

// state woła sterownik, mode też strona sterownika (wystarczy ?deviceId=, core/middleware/device-context.ts)
router.post('/switch/state', postSwitchState)
router.put('/switch/mode', putSwitchMode)
router.get('/switch/relays', getSwitchRelays)
router.put('/switch/relays/:relay', putSwitchRelayName)
router.get('/switch/schedules', getSwitchSchedules)
router.post('/switch/schedules', postSwitchSchedule)
router.put('/switch/schedules/:id', putSwitchSchedule)
router.delete('/switch/schedules/:id', deleteSwitchSchedule)
router.get('/switch/activations', getSwitchActivations)

export default router
