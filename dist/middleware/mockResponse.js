"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prefixMocks = prefixMocks;
exports.mockResponse = mockResponse;
// middleware/mockResponse.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function prefixMocks(service) {
    const raw = fs_1.default.readFileSync(path_1.default.join(__dirname, `../../mock-responses/${service}.json`), 'utf8');
    return JSON.parse(raw);
}
function mockResponse(service, delay = 300) {
    const data = prefixMocks(service);
    return new Promise(resolve => setTimeout(() => resolve(data), delay));
}
