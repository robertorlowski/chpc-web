import { Router } from "express";
import { listHp, createHp, latestHp } from "../controllers/hp.controller";
import { validateBody } from "../middleware/ajv";
const router = Router();
router.get("/", listHp);
router.get("/latest", latestHp);
router.post("/", validateBody("HpEntry.schema.json"), createHp);
export default router;
