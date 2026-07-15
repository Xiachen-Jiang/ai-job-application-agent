import { Router } from "express";
import { prisma } from "@job-agent/db";
import { masterResumeSchema, RESUME_LABELS, isResumeLabel } from "@job-agent/shared";
import { z } from "zod";

const saveSchema = z.object({
  label: z.string().refine(isResumeLabel, "Invalid resume label"),
  displayName: z.string().optional(),
  content: masterResumeSchema,
});

export const resumeRouter = Router();

resumeRouter.get("/master", async (_req, res, next) => {
  try {
    const resumes = await prisma.masterResume.findMany({
      where: { isActive: true },
      orderBy: { label: "asc" },
    });
    res.json(resumes);
  } catch (e) {
    next(e);
  }
});

resumeRouter.get("/master/:label", async (req, res, next) => {
  try {
    const resume = await prisma.masterResume.findUnique({
      where: { label: req.params.label },
    });
    if (!resume) return res.status(404).json({ error: "Resume profile not found" });
    res.json(resume);
  } catch (e) {
    next(e);
  }
});

resumeRouter.post("/master", async (req, res, next) => {
  try {
    const input = saveSchema.parse(req.body);
    const displayName =
      input.displayName ??
      RESUME_LABELS[input.label]?.displayName ??
      input.label;

    const existing = await prisma.masterResume.findUnique({
      where: { label: input.label },
    });

    const resume = existing
      ? await prisma.masterResume.update({
          where: { label: input.label },
          data: {
            content: input.content,
            displayName,
            version: existing.version + 1,
            isActive: true,
          },
        })
      : await prisma.masterResume.create({
          data: {
            label: input.label,
            displayName,
            content: input.content,
            version: 1,
            isActive: true,
          },
        });

    res.status(existing ? 200 : 201).json(resume);
  } catch (e) {
    next(e);
  }
});
