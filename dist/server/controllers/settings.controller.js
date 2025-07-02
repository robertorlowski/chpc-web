"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setSettings = void 0;
exports.getSettings = getSettings;
const settings_service_1 = require("../services/settings.service");
function getSettings(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield (0, settings_service_1.getSettingsData)();
            return res.status(200).send(result);
        }
        catch (error) {
            return res.status(500).send({ error: error });
        }
    });
}
const setSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = req.body;
    try {
        yield (0, settings_service_1.setSettingsData)(data);
        return res.status(201).json({ message: data });
    }
    catch (error) {
        return res.status(500).send({ error: error });
    }
});
exports.setSettings = setSettings;
