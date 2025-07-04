"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setOperationData = exports.getOperationData = void 0;
let operation = {};
const getOperationData = () => {
    return operation;
};
exports.getOperationData = getOperationData;
const setOperationData = (data) => {
    operation = data;
    return operation;
};
exports.setOperationData = setOperationData;
