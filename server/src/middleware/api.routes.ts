import express from 'express'

import { getHp, addHp, getHpAll } from './../controllers/hp.controller'
import { getSettings, setSettings } from './../controllers/settings.controller'
import { getOperation, setOperation } from '../controllers/operation.controller'
import { setOperationData } from '../services/operation.service'


const router = express.Router()
router.get('/operation', getOperation);
router.post('/operation/set', setOperation);

router.get('/hp', getHp)
router.get('/hp/all', getHpAll)
router.post('/hp/add', addHp)

router.get('/settings', getSettings)
router.post('/settings/set', setSettings)

export default router
