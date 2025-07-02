"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./middleware/app"));
const port = 4001;
app_1.default.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`);
});
