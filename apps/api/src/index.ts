import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../../../.env") });

import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health";
import { profileRouter } from "./routes/profile";
import { resumeRouter } from "./routes/resume";
import { jobsRouter } from "./routes/jobs";
import { applicationsRouter } from "./routes/applications";
import { authMiddleware } from "./middleware/auth";

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

app.use(
  cors({
    origin: process.env.WEB_URL ?? "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

app.use("/api/health", healthRouter);
app.use("/api", authMiddleware);
app.use("/api/profile", profileRouter);
app.use("/api/resume", resumeRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/applications", applicationsRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message ?? "Internal server error" });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
