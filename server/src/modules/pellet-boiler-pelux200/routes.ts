import express from 'express'
import {
  addPelletBoilerPelux200, addPelletBoilerPelux200Settings, getPelletBoilerPelux200,
  getPelletBoilerPelux200List, getPelletBoilerPelux200Settings, addPelletBoilerPelux200Commands,
  getPelletBoilerPelux200Commands, getPelletBoilerPelux200NextCommand, addPelletBoilerPelux200CommandResult,
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

export default router
