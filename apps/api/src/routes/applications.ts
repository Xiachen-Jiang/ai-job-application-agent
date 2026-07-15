import { Router } from "express";
import {
  applicationCreateSchema,
  applicationUpdateSchema,
  createLogger,
  runAgent,
} from "@job-agent/shared";
import {
  createApplication,
  listApplications,
  trackingExportAgent,
  updateApplication,
} from "@job-agent/tracking-agent";
import { prisma } from "@job-agent/db";

export const applicationsRouter = Router();

applicationsRouter.get("/", async (_req, res, next) => {
  try {
    const apps = await listApplications();
    res.json(apps);
  } catch (e) {
    next(e);
  }
});

applicationsRouter.post("/", async (req, res, next) => {
  try {
    const input = applicationCreateSchema.parse(req.body);

    if (input.jobId && !input.resumeVersionId) {
      const latestResume = await prisma.tailoredResume.findFirst({
        where: { jobId: input.jobId },
        orderBy: { version: "desc" },
      });
      const latestCover = await prisma.coverLetter.findFirst({
        where: { jobId: input.jobId },
        orderBy: { version: "desc" },
      });
      input.resumeVersionId = latestResume?.id;
      input.coverLetterId = latestCover?.id;
    }

    const app = await createApplication(input);
    res.status(201).json(app);
  } catch (e) {
    next(e);
  }
});

applicationsRouter.patch("/:id", async (req, res, next) => {
  try {
    const input = applicationUpdateSchema.parse(req.body);
    const app = await updateApplication(req.params.id, input);
    res.json(app);
  } catch (e) {
    next(e);
  }
});

applicationsRouter.get("/export", async (req, res, next) => {
  try {
    const format = req.query.format === "xlsx" ? "xlsx" : "csv";
    const result = await runAgent(
      trackingExportAgent,
      { format },
      { correlationId: "export", logger: createLogger("export") }
    );

    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    if (result.buffer) return res.send(result.buffer);
    return res.send(result.content ?? "");
  } catch (e) {
    next(e);
  }
});

applicationsRouter.get("/stats/summary", async (_req, res, next) => {
  try {
    const grouped = await prisma.application.groupBy({
      by: ["status"],
      _count: { status: true },
    });
    const totalJobs = await prisma.job.count();
    res.json({ byStatus: grouped, totalJobs });
  } catch (e) {
    next(e);
  }
});
