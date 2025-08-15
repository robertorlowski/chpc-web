import { Router } from "express";
import { getSettings, upsertSettings } from "../controllers/settings.controller";
import { validateBody } from "../middleware/ajv";
const router = Router();
router.get("/", getSettings);
router.put("/", validateBody("SettingsEntry.schema.json"), upsertSettings);
export default router;
