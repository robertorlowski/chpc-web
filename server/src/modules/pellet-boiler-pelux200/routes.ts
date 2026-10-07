import express from 'express'
import {
  addPelletBoilerPelux200, addPelletBoilerPelux200Settings, getPelletBoilerPelux200,
  getPelletBoilerPelux200List, getPelletBoilerPelux200Settings, addPelletBoilerPelux200Commands,
  getPelletBoilerPelux200Commands, getPelletBoilerPelux200NextCommand, addPelletBoilerPelux200CommandResult,
  getPelletBoilerScheduleSettings, putPelletBoilerScheduleSettings, getPelletBoilerCurrentSchedule,
  getPelletBoilerSchedules, postPelletBoilerSchedule, putPelletBoilerSchedule, deletePelletBoilerSchedule,
  getPelletBoilerCwuLoading, getPelletBoilerAutoPellet, acknowledgePelletBoilerAutoPellet, putPelletBoilerSeason,
  addPelletBoilerPelux200Alerts, getPelletBoilerPelux200Alerts, getPelletBoilerPelux200Fuel,
} from './controllers/pellet-boiler-pelux200.controller'

// Kocioł pelletowy Pellux 200: zapis odczytu (sterownik pieca), ostatni odczyt, lista dnia
// i ustawienia regulatora.
const router = express.Router()

// add i POST settings woła sterownik (wystarczy ?deviceId=, core/middleware/device-context.ts)
router.post('/pellet-boiler-pelux200/add', addPelletBoilerPelux200)
router.get('/pellet-boiler-pelux200/last', getPelletBoilerPelux200)
router.get('/pellet-boiler-pelux200/list', getPelletBoilerPelux200List)
router.post('/pellet-boiler-pelux200/settings', addPelletBoilerPelux200Settings)
router.get('/pellet-boiler-pelux200/settings', getPelletBoilerPelux200Settings)
// zmiana parametrów: aplikacja zleca i czyta historię, sterownik odbiera (next) i potwierdza (result)
router.post('/pellet-boiler-pelux200/commands', addPelletBoilerPelux200Commands)
router.get('/pellet-boiler-pelux200/commands', getPelletBoilerPelux200Commands)
router.get('/pellet-boiler-pelux200/commands/next', getPelletBoilerPelux200NextCommand)
router.post('/pellet-boiler-pelux200/commands/result', addPelletBoilerPelux200CommandResult)
// harmonogram: sezon (zakres dat) i CWU od–do (okna godzin), ustawienie poza harmonogramem
router.get('/pellet-boiler-pelux200/schedule-settings', getPelletBoilerScheduleSettings)
router.put('/pellet-boiler-pelux200/schedule-settings', putPelletBoilerScheduleSettings)
router.get('/pellet-boiler-pelux200/schedules/current', getPelletBoilerCurrentSchedule)
// przycisk Lato / Zima w trybie pompy ciepła: sezon przez cykl Zimy (pellet-boiler-pelux200-winter-cycle.service.ts)
router.put('/pellet-boiler-pelux200/season', putPelletBoilerSeason)
// ładowanie CWU w trybie pompy ciepła (pompa ciepła grzeje wtedy 47–49 °C), dla ekranu głównego kotła
router.get('/pellet-boiler-pelux200/cwu-loading', getPelletBoilerCwuLoading)
// automatyczne przejście na Pellet po rozpalaniu w trybie pompy ciepła: komunikat na ekranie i „OK”
router.get('/pellet-boiler-pelux200/auto-pellet', getPelletBoilerAutoPellet)
router.post('/pellet-boiler-pelux200/auto-pellet/ack', acknowledgePelletBoilerAutoPellet)
// dziennik alarmów z panelu kotła: sterownik przesyła (POST, samym deviceId), aplikacja czyta (GET)
router.post('/pellet-boiler-pelux200/alerts', addPelletBoilerPelux200Alerts)
router.get('/pellet-boiler-pelux200/alerts', getPelletBoilerPelux200Alerts)
// spalony pellet w okresach (licznik ze sterownika, firmware pieca od 1.7.1)
router.get('/pellet-boiler-pelux200/fuel', getPelletBoilerPelux200Fuel)
router.get('/pellet-boiler-pelux200/schedules', getPelletBoilerSchedules)
router.post('/pellet-boiler-pelux200/schedules', postPelletBoilerSchedule)
router.put('/pellet-boiler-pelux200/schedules/:id', putPelletBoilerSchedule)
router.delete('/pellet-boiler-pelux200/schedules/:id', deletePelletBoilerSchedule)

export default router
