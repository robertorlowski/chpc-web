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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addHpData = exports.getHpLast = void 0;
const db_1 = __importDefault(require("../middleware/db"));
const getHpLast = () => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.default.read();
    const hp = db_1.default.data.hp;
    if (hp.length == 0) {
        return yield new Promise(resolve => setTimeout(() => resolve({}), 500));
    }
    return yield new Promise(resolve => setTimeout(() => resolve(hp[hp.length - 1]), 500));
});
exports.getHpLast = getHpLast;
const addHpData = (data) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.default.read();
    const hp = db_1.default.data.hp;
    hp.push(data);
    yield db_1.default.write();
    return data;
});
exports.addHpData = addHpData;
