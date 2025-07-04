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
exports.setOperation = void 0;
exports.getOperation = getOperation;
const operation_service_1 = require("../services/operation.service");
function getOperation(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return res.status(200).send((0, operation_service_1.getOperationData)());
        }
        catch (error) {
            return res.status(500).send({ error: error });
        }
    });
}
const setOperation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const op = req.body;
    (0, operation_service_1.setOperationData)(op);
    return res.status(201).json({ message: op });
});
exports.setOperation = setOperation;
