import { Router } from "express";
import { getOperation, upsertOperation } from "../controllers/operation.controller";
import { validateBody } from "../middleware/ajv";
const router = Router();
router.get("/", getOperation);
router.put("/", validateBody("OperationEntry.schema.json"), upsertOperation);
export default router;
