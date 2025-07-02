import express from 'express'

import { getHp, addHp } from './../controllers/hp.controller'
import { getSettings, setSettings } from './../controllers/settings.controller'


const router = express.Router()
router.get('/hp', getHp)
router.post('/hp/add', addHp)
router.get('/settings', getSettings)
router.post('/settings/set', setSettings)

export default router
