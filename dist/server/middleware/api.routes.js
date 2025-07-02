"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const hp_controller_1 = require("./../controllers/hp.controller");
const settings_controller_1 = require("./../controllers/settings.controller");
const router = express_1.default.Router();
router.get('/hp', hp_controller_1.getHp);
router.post('/hp/add', hp_controller_1.addHp);
router.get('/settings', settings_controller_1.getSettings);
router.post('/settings/set', settings_controller_1.setSettings);
exports.default = router;
