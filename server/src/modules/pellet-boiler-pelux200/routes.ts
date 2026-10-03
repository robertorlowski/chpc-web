import express from 'express'
import {
  addPelletBoilerPelux200, addPelletBoilerPelux200Settings, getPelletBoilerPelux200,
  getPelletBoilerPelux200List, getPelletBoilerPelux200Settings,
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

export default router
