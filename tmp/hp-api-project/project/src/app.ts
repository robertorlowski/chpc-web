import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";

import hpRoutes from "./routes/hp.routes";
import settingsRoutes from "./routes/settings.routes";
import operationRoutes from "./routes/operation.routes";

dotenv.config();
const app = express();
app.use(express.json());

app.use("/api/hp", hpRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/operation", operationRoutes);

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/hpdb";
const PORT = Number(process.env.PORT ?? 3000);

(async () => {
  await mongoose.connect(MONGODB_URI);
  console.log("Mongo connected");
  app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
})();
