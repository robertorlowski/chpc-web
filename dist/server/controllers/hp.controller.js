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
exports.addHp = void 0;
exports.getHp = getHp;
const hp_service_1 = require("../services/hp.service");
function getHp(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield (0, hp_service_1.getHpLast)();
            return res.status(200).send(result);
        }
        catch (error) {
            console.log(error);
            return res.status(500).send({ message: 'Something went wrong' });
        }
    });
}
const addHp = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const data = req.body;
    try {
        yield (0, hp_service_1.addHpData)(data);
        return res.status(201).json({ message: data });
    }
    catch (error) {
        return res.status(500).send({ error: error });
    }
});
exports.addHp = addHp;
