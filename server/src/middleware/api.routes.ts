import express from 'express'

import { getHp, addHp, getHpAll, clearHp } from './../controllers/hp.controller'
import { getSettings, setSettings } from './../controllers/settings.controller'
import { getAndClearOperation, getOperation, prepareOperation, setOperation } from '../controllers/operation.controller'


const router = express.Router()
router.get('/operation', prepareOperation);
router.post('/operation/set', setOperation);
router.get('/operation/get', getOperation);
router.get('/operation/getAndClear', getAndClearOperation);

router.get('/hp', getHp)
router.get('/hp/all', getHpAll)
router.post('/hp/add', addHp)
router.post('/hp/clear', clearHp)

router.get('/settings', getSettings)
router.post('/settings/set', setSettings)

export default router
