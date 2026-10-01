import express from 'express'
import {
  addPelletBoilerPelux200, getPelletBoilerPelux200, getPelletBoilerPelux200List,
} from './controllers/pellet-boiler-pelux200.controller'

// Kocioł pelletowy Pellux 200: zapis odczytu (sterownik co), ostatni odczyt i lista dnia.
const router = express.Router()

// add woła sterownik (wystarczy ?deviceId=, core/middleware/device-context.ts)
router.post('/pellet-boiler-pelux200/add', addPelletBoilerPelux200)
router.get('/pellet-boiler-pelux200/last', getPelletBoilerPelux200)
router.get('/pellet-boiler-pelux200/list', getPelletBoilerPelux200List)

export default router
