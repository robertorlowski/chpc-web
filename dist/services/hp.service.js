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
exports.addHpData = exports.getHpAllData = exports.getHpLastData = void 0;
const db_1 = __importDefault(require("../middleware/db"));
const operation_service_1 = require("./operation.service");
const parseDate = (str) => !str ? "" : str.replace(/\./g, "-").replace(" ", "T");
const getHpLastData = () => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.default.read();
    const hp = db_1.default.data.hp;
    if (hp.length == 0) {
        return {};
    }
    return hp[hp.length - 1];
});
exports.getHpLastData = getHpLastData;
const getHpAllData = () => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.default.read();
    const hp = db_1.default.data.hp;
    return db_1.default.data.hp.sort((a, b) => {
        if ((!a.time) || (!b.time)) {
            return 0;
        }
        return new Date(parseDate(b.time)).getTime() - new Date(parseDate(a.time)).getTime();
    });
});
exports.getHpAllData = getHpAllData;
const addHpData = (data) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    yield db_1.default.read();
    const coList = db_1.default.data.hp;
    const op = {};
    op.force = ((_a = data.HP) === null || _a === void 0 ? void 0 : _a.F) ? "1" : "0";
    op.co_min = data === null || data === void 0 ? void 0 : data.co_min;
    op.co_max = data === null || data === void 0 ? void 0 : data.co_max;
    op.cwu_min = data === null || data === void 0 ? void 0 : data.cwu_min,
        op.cwu_max = data === null || data === void 0 ? void 0 : data.co_max,
        op.cold_pomp = ((_b = data === null || data === void 0 ? void 0 : data.HP) === null || _b === void 0 ? void 0 : _b.CCS) ? "1" : "0";
    op.hot_pomp = ((_c = data === null || data === void 0 ? void 0 : data.HP) === null || _c === void 0 ? void 0 : _c.HCS) ? "1" : "0";
    op.sump_heater = ((_d = data === null || data === void 0 ? void 0 : data.HP) === null || _d === void 0 ? void 0 : _d.SHS) ? "1" : "0";
    op.work_mode = data === null || data === void 0 ? void 0 : data.work_mode;
    (0, operation_service_1.setOperationData)(op);
    //jeśli spręzarka ne działa i poprzednio nie działała to nie zapisujemy danych do bazy
    if (!((_e = data === null || data === void 0 ? void 0 : data.HP) === null || _e === void 0 ? void 0 : _e.HPS)) {
        if (coList.length > 0 && !((_f = coList[coList.length - 1].HP) === null || _f === void 0 ? void 0 : _f.HPS)) {
            return {};
        }
    }
    coList.push(data);
    yield db_1.default.write();
    return data;
});
exports.addHpData = addHpData;
