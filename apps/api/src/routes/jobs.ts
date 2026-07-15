import { Router } from "express";
import path from "path";
import { prisma, Prisma } from "@job-agent/db";
import { jobSearchAgent } from "@job-agent/job-search-agent";
import { jdAnalyzerAgent } from "@job-agent/jd-analyzer-agent";
import { coverLetterAgent } from "@job-agent/cover-letter-agent";
import {
  attachResumeTemplate,
  computeMatchScore,
  createLogger,
  runAgent,
  hashDescription,
  manualJobInputSchema,
  masterResumeSchema,
  getStorage,
  suggestResumeLabel,
  isResumeLabel,
  RESUME_LABELS,
  type ResumeLabel,
} from "@job-agent/shared";

export const jobsRouter = Router();

async function getProfileAndResume(label?: ResumeLabel) {
  const profile = await prisma.userProfile.findFirst();
  const masterResume = label
    ? await prisma.masterResume.findUnique({ where: { label } })
    : await prisma.masterResume.findFirst({ where: { isActive: true }, orderBy: { label: "asc" } });
  return { profile, masterResume };
}

async function resolveMasterResume(jobTitle: string, jobDescription: string, requestedLabel?: string) {
  const label: ResumeLabel =
    requestedLabel && isResumeLabel(requestedLabel)
      ? requestedLabel
      : suggestResumeLabel(jobTitle, jobDescription);

  const masterResume = await prisma.masterResume.findUnique({ where: { label } });
  if (!masterResume) {
    throw new Error(
      `Resume template "${label}" not found. Run pnpm db:seed to register targeted resumes.`
    );
  }

  return { masterResume, label };
}

type CoverTemplate = "formal" | "concise_tech" | "narrative";

interface PreparedMaterials {
  jobId: string;
  title: string;
  company: string;
  applyUrl: string | null;
  resumeLabel: ResumeLabel;
  resumeDisplayName: string;
  folder: string;
  resumeDocxPath: string;
  coverDocxPath: string | null;
  coverPdfPath: string | null;
  applicationId: string;
  applicationStatus: string;
}

/**
 * Auto-selects the closest resume template, attaches it, generates a cover
 * letter (AI with template fallback), and records everything against a SAVED
 * application. Reused by the single-job routes and the batch pipeline.
 */
async function prepareJobMaterials(
  jobId: string,
  coverTemplate: CoverTemplate = "concise_tech"
): Promise<PreparedMaterials> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const { masterResume, label } = await resolveMasterResume(job.title, job.description);

  const duplicateCount = await prisma.job.count({
    where: { company: job.company, title: job.title, NOT: { id: job.id } },
  });
  const conflictSuffix = duplicateCount > 0 ? String(duplicateCount + 1) : undefined;

  const run = await prisma.agentRun.create({
    data: { agentName: "batch-prepare", status: "RUNNING", inputRef: job.id },
  });
  const logger = createLogger(run.id);
  const start = Date.now();

  try {
    const lastResume = await prisma.tailoredResume.findFirst({
      where: { jobId: job.id },
      orderBy: { version: "desc" },
    });
    const attach = await attachResumeTemplate({
      label,
      company: job.company,
      jobTitle: job.title,
      templateDocxPath: masterResume.docxPath,
      conflictSuffix,
    });
    const tailored = await prisma.tailoredResume.create({
      data: {
        jobId: job.id,
        masterResumeId: masterResume.id,
        version: (lastResume?.version ?? 0) + 1,
        content: { attached: true, templateLabel: label },
        docxPath: attach.docxPath,
      },
    });

    const resumeContent = masterResumeSchema.parse(masterResume.content);
    const lastCover = await prisma.coverLetter.findFirst({
      where: { jobId: job.id },
      orderBy: { version: "desc" },
    });
    const coverResult = await runAgent(
      coverLetterAgent,
      {
        company: job.company,
        jobTitle: job.title,
        jobDescription: job.description,
        masterResume: resumeContent,
        template: coverTemplate,
        conflictSuffix,
      },
      { correlationId: run.id, logger }
    );
    const coverLetter = await prisma.coverLetter.create({
      data: {
        jobId: job.id,
        version: (lastCover?.version ?? 0) + 1,
        content: coverResult.content,
        docxPath: coverResult.docxPath,
        pdfPath: coverResult.pdfPath,
      },
    });

    const existingApp = await prisma.application.findFirst({
      where: { jobId: job.id },
      orderBy: { createdAt: "desc" },
    });
    const application = existingApp
      ? await prisma.application.update({
          where: { id: existingApp.id },
          data: {
            resumeVersionId: tailored.id,
            coverLetterId: coverLetter.id,
            role: job.title,
            company: job.company,
          },
        })
      : await prisma.application.create({
          data: {
            jobId: job.id,
            company: job.company,
            role: job.title,
            status: "SAVED",
            resumeVersionId: tailored.id,
            coverLetterId: coverLetter.id,
          },
        });

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", durationMs: Date.now() - start, outputRef: application.id },
    });

    return {
      jobId: job.id,
      title: job.title,
      company: job.company,
      applyUrl: job.applyUrl,
      resumeLabel: label,
      resumeDisplayName: RESUME_LABELS[label].displayName,
      folder: attach.folder,
      resumeDocxPath: tailored.docxPath ?? attach.docxPath,
      coverDocxPath: coverLetter.docxPath,
      coverPdfPath: coverLetter.pdfPath,
      applicationId: application.id,
      applicationStatus: application.status,
    };
  } catch (e) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - start,
      },
    });
    throw e;
  }
}

async function upsertMatchScore(jobId: string) {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const analysis = await prisma.jobAnalysis.findUnique({ where: { jobId } });
  const { profile } = await getProfileAndResume();

  const scores = computeMatchScore({
    jobDescription: job.description,
    jobLocation: job.location,
    jobSalaryRaw: job.salaryRaw,
    userSkills: profile?.skills ?? [],
    userLocations: profile?.targetLocations ?? [],
    minSalaryAud: profile?.minSalaryAud,
    visaSponsorshipRequired: profile?.visaSponsorshipRequired ?? false,
    requiredSkills: analysis?.requiredSkills,
    preferredSkills: analysis?.preferredSkills,
  });

  const scoreData = {
    skillScore: scores.skillScore,
    salaryScore: scores.salaryScore,
    locationScore: scores.locationScore,
    visaScore: scores.visaScore,
    totalScore: scores.totalScore,
    breakdown: scores.breakdown as Prisma.InputJsonValue,
  };

  return prisma.jobMatchScore.upsert({
    where: { jobId },
    create: { jobId, ...scoreData },
    update: scoreData,
  });
}

jobsRouter.post("/search", async (req, res, next) => {
  const run = await prisma.agentRun.create({
    data: { agentName: "job-search-agent", status: "RUNNING" },
  });
  const start = Date.now();
  const correlationId = run.id;

  try {
    const result = await runAgent(
      jobSearchAgent,
      {
        query: req.body.query ?? "software engineer",
        location: req.body.location ?? "",
        source: req.body.source ?? "seek",
        states: req.body.states ?? ["VIC", "WA", "SA"],
        maxAgeDays: req.body.maxAgeDays ?? 7,
        limit: req.body.limit ?? 50,
      },
      { correlationId, logger: createLogger(correlationId) }
    );

    const savedJobs = [];
    for (const jobInput of result.jobs) {
      const job = await prisma.job.upsert({
        where: {
          source_externalId: {
            source: jobInput.source,
            externalId: jobInput.externalId ?? jobInput.title,
          },
        },
        create: {
          source: jobInput.source,
          externalId: jobInput.externalId ?? jobInput.title,
          title: jobInput.title,
          company: jobInput.company,
          salaryRaw: jobInput.salaryRaw,
          location: jobInput.location,
          workType: jobInput.workType,
          description: jobInput.description,
          applyUrl: jobInput.applyUrl,
        },
        update: {
          title: jobInput.title,
          company: jobInput.company,
          salaryRaw: jobInput.salaryRaw,
          location: jobInput.location,
          workType: jobInput.workType,
          description: jobInput.description,
          applyUrl: jobInput.applyUrl,
        },
      });
      await upsertMatchScore(job.id);
      savedJobs.push(job);
    }

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        durationMs: Date.now() - start,
        outputRef: `${savedJobs.length} jobs`,
      },
    });

    res.json({ agentRunId: run.id, count: savedJobs.length, jobs: savedJobs });
  } catch (e) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - start,
      },
    });
    next(e);
  }
});

jobsRouter.post("/batch-prepare", async (req, res, next) => {
  try {
    const jobIds = Array.isArray(req.body?.jobIds) ? (req.body.jobIds as string[]) : [];
    if (jobIds.length === 0) {
      return res.status(400).json({ error: "jobIds must be a non-empty array" });
    }
    const coverTemplate = (req.body?.coverTemplate as CoverTemplate) ?? "concise_tech";

    const results = [];
    for (const jobId of jobIds) {
      try {
        const prepared = await prepareJobMaterials(jobId, coverTemplate);
        results.push({ ...prepared, ok: true as const });
      } catch (e) {
        results.push({
          jobId,
          ok: false as const,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    res.json({ results, prepared: results.filter((r) => r.ok).length, total: jobIds.length });
  } catch (e) {
    next(e);
  }
});

jobsRouter.post("/batch-apply", async (req, res, next) => {
  try {
    const jobIds = Array.isArray(req.body?.jobIds) ? (req.body.jobIds as string[]) : [];
    if (jobIds.length === 0) {
      return res.status(400).json({ error: "jobIds must be a non-empty array" });
    }

    const appliedDate = new Date();
    const results = [];
    for (const jobId of jobIds) {
      try {
        const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
        const existing = await prisma.application.findFirst({
          where: { jobId },
          orderBy: { createdAt: "desc" },
        });
        const application = existing
          ? await prisma.application.update({
              where: { id: existing.id },
              data: { status: "APPLIED", appliedDate },
            })
          : await prisma.application.create({
              data: {
                jobId,
                company: job.company,
                role: job.title,
                status: "APPLIED",
                appliedDate,
              },
            });
        results.push({ jobId, applicationId: application.id, status: application.status, ok: true as const });
      } catch (e) {
        results.push({ jobId, ok: false as const, error: e instanceof Error ? e.message : String(e) });
      }
    }

    res.json({ results, applied: results.filter((r) => r.ok).length, total: jobIds.length });
  } catch (e) {
    next(e);
  }
});

async function isJobApplied(jobId: string): Promise<boolean> {
  const latest = await prisma.application.findFirst({
    where: { jobId },
    orderBy: { createdAt: "desc" },
  });
  return latest?.status === "APPLIED";
}

jobsRouter.post("/delete-non-applied", async (req, res, next) => {
  try {
    const jobIds = Array.isArray(req.body?.jobIds) ? (req.body.jobIds as string[]) : undefined;
    const source = req.body?.source as "SEEK" | "APS_JOBS" | "MANUAL" | undefined;

    const candidates = await prisma.job.findMany({
      where: {
        ...(source ? { source } : {}),
        ...(jobIds?.length ? { id: { in: jobIds } } : {}),
      },
      select: { id: true, title: true, company: true },
    });

    const deleted: { jobId: string; title: string; company: string }[] = [];
    const skipped: { jobId: string; title: string; company: string; reason: string }[] = [];

    for (const job of candidates) {
      if (await isJobApplied(job.id)) {
        skipped.push({ ...job, reason: "APPLIED" });
        continue;
      }
      await prisma.application.deleteMany({ where: { jobId: job.id } });
      await prisma.job.delete({ where: { id: job.id } });
      deleted.push(job);
    }

    res.json({ deleted: deleted.length, skipped: skipped.length, deletedJobs: deleted, skippedJobs: skipped });
  } catch (e) {
    next(e);
  }
});

jobsRouter.post("/manual", async (req, res, next) => {
  try {
    const input = manualJobInputSchema.parse(req.body);
    const job = await prisma.job.create({
      data: {
        source: "MANUAL",
        externalId: `manual-${Date.now()}`,
        title: input.title,
        company: input.company,
        description: input.description,
        applyUrl: input.applyUrl,
        location: input.location,
        salaryRaw: input.salaryRaw,
        workType: input.workType,
      },
    });
    await upsertMatchScore(job.id);
    res.status(201).json(job);
  } catch (e) {
    next(e);
  }
});

jobsRouter.get("/", async (req, res, next) => {
  try {
    const sort = req.query.sort === "score" ? "score" : "recent";
    const source = req.query.source as string | undefined;
    const applicationStatus = req.query.applicationStatus as "pending" | "applied" | undefined;

    let jobs = await prisma.job.findMany({
      where: source ? { source: source as "SEEK" | "APS_JOBS" | "MANUAL" } : undefined,
      include: {
        matchScore: true,
        analysis: true,
        applications: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: sort === "score" ? { matchScore: { totalScore: "desc" } } : { createdAt: "desc" },
    });

    if (applicationStatus === "applied" || applicationStatus === "pending") {
      jobs = jobs.filter((job) => {
        const applied = job.applications[0]?.status === "APPLIED";
        return applicationStatus === "applied" ? applied : !applied;
      });
    }

    if (applicationStatus === "applied") {
      jobs.sort((a, b) => {
        const aDate = a.applications[0]?.appliedDate?.getTime() ?? 0;
        const bDate = b.applications[0]?.appliedDate?.getTime() ?? 0;
        return bDate - aDate;
      });
    }

    res.json(jobs);
  } catch (e) {
    next(e);
  }
});

jobsRouter.get("/:id", async (req, res, next) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: {
        matchScore: true,
        analysis: true,
        tailoredResumes: { orderBy: { version: "desc" } },
        coverLetters: { orderBy: { version: "desc" } },
        applications: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json({
      ...job,
      suggestedResumeLabel: suggestResumeLabel(job.title, job.description),
      resumeProfiles: Object.values(RESUME_LABELS),
    });
  } catch (e) {
    next(e);
  }
});

jobsRouter.post("/:id/analyze", async (req, res, next) => {
  const run = await prisma.agentRun.create({
    data: { agentName: "jd-analyzer-agent", status: "RUNNING", inputRef: req.params.id },
  });
  const start = Date.now();

  try {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: req.params.id } });
    const descHash = hashDescription(job.description);
    const cached = await prisma.jobAnalysis.findFirst({
      where: { jobId: job.id, descriptionHash: descHash },
    });
    if (cached) {
      await upsertMatchScore(job.id);
      return res.json(cached);
    }

    const { profile } = await getProfileAndResume();
    const analysisResult = await runAgent(
      jdAnalyzerAgent,
      {
        jobDescription: job.description,
        jobTitle: job.title,
        company: job.company,
        userSkills: profile?.skills ?? [],
      },
      { correlationId: run.id, logger: createLogger(run.id) }
    );

    const analysis = await prisma.jobAnalysis.upsert({
      where: { jobId: job.id },
      create: {
        jobId: job.id,
        requiredSkills: analysisResult.required_skills,
        preferredSkills: analysisResult.preferred_skills,
        seniority: analysisResult.seniority,
        industry: analysisResult.industry,
        summary: analysisResult.summary,
        llmMatchScore: analysisResult.match_score,
        hiddenSignals: analysisResult.hidden_signals ?? {},
        descriptionHash: descHash,
      },
      update: {
        requiredSkills: analysisResult.required_skills,
        preferredSkills: analysisResult.preferred_skills,
        seniority: analysisResult.seniority,
        industry: analysisResult.industry,
        summary: analysisResult.summary,
        llmMatchScore: analysisResult.match_score,
        hiddenSignals: analysisResult.hidden_signals ?? {},
        descriptionHash: descHash,
      },
    });

    await upsertMatchScore(job.id);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", durationMs: Date.now() - start, outputRef: analysis.id },
    });
    res.json(analysis);
  } catch (e) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - start,
      },
    });
    next(e);
  }
});

jobsRouter.post("/:id/resume", async (req, res, next) => {
  const run = await prisma.agentRun.create({
    data: { agentName: "resume-template-attach", status: "RUNNING", inputRef: req.params.id },
  });
  const start = Date.now();
  const logger = createLogger(run.id);

  try {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: req.params.id } });
    const requestedLabel = req.body?.label as string | undefined;
    const { masterResume, label } = await resolveMasterResume(job.title, job.description, requestedLabel);

    const lastVersion = await prisma.tailoredResume.findFirst({
      where: { jobId: job.id },
      orderBy: { version: "desc" },
    });
    const nextVersion = (lastVersion?.version ?? 0) + 1;

    const duplicateCount = await prisma.job.count({
      where: { company: job.company, title: job.title, NOT: { id: job.id } },
    });

    const result = await attachResumeTemplate({
      label,
      company: job.company,
      jobTitle: job.title,
      templateDocxPath: masterResume.docxPath,
      conflictSuffix: duplicateCount > 0 ? String(duplicateCount + 1) : undefined,
    });

    logger.info("Resume attached", {
      folder: result.folder,
      docxPath: result.docxPath,
      template: label,
    });

    const tailored = await prisma.tailoredResume.create({
      data: {
        jobId: job.id,
        masterResumeId: masterResume.id,
        version: nextVersion,
        content: { attached: true, templateLabel: label },
        docxPath: result.docxPath,
      },
    });

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", durationMs: Date.now() - start, outputRef: tailored.id },
    });
    res.status(201).json({ ...tailored, masterResumeLabel: label, displayName: RESUME_LABELS[label].displayName });
  } catch (e) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - start,
      },
    });
    next(e);
  }
});

jobsRouter.post("/:id/cover-letter", async (req, res, next) => {
  const run = await prisma.agentRun.create({
    data: { agentName: "cover-letter-agent", status: "RUNNING", inputRef: req.params.id },
  });
  const start = Date.now();

  try {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: req.params.id } });
    const requestedLabel = req.body?.label as string | undefined;
    const { masterResume, label } = await resolveMasterResume(job.title, job.description, requestedLabel);

    const content = masterResumeSchema.parse(masterResume.content);
    const lastVersion = await prisma.coverLetter.findFirst({
      where: { jobId: job.id },
      orderBy: { version: "desc" },
    });
    const nextVersion = (lastVersion?.version ?? 0) + 1;
    const duplicateCount = await prisma.job.count({
      where: { company: job.company, title: job.title, NOT: { id: job.id } },
    });

    const result = await runAgent(
      coverLetterAgent,
      {
        company: job.company,
        jobTitle: job.title,
        jobDescription: job.description,
        masterResume: content,
        template: (req.body.template as "formal" | "concise_tech" | "narrative") ?? "concise_tech",
        conflictSuffix: duplicateCount > 0 ? String(duplicateCount + 1) : undefined,
      },
      { correlationId: run.id, logger: createLogger(run.id) }
    );

    const coverLetter = await prisma.coverLetter.create({
      data: {
        jobId: job.id,
        version: nextVersion,
        content: result.content,
        docxPath: result.docxPath,
        pdfPath: result.pdfPath,
      },
    });

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", durationMs: Date.now() - start, outputRef: coverLetter.id },
    });
    res.status(201).json({ ...coverLetter, masterResumeLabel: label });
  } catch (e) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - start,
      },
    });
    next(e);
  }
});

jobsRouter.get("/:id/materials/:type/export", async (req, res, next) => {
  try {
    const type = req.params.type;
    const format = (req.query.format as string) ?? "docx";
    if (!["resume", "cover-letter"].includes(type)) {
      return res.status(400).json({ error: "Invalid material type" });
    }
    if (!["docx", "pdf"].includes(format)) {
      return res.status(400).json({ error: "Invalid format" });
    }

    const job = await prisma.job.findUniqueOrThrow({ where: { id: req.params.id } });
    let filePath: string | null | undefined;

    if (type === "resume") {
      const latest = await prisma.tailoredResume.findFirst({
        where: { jobId: job.id },
        orderBy: { version: "desc" },
      });
      filePath = format === "pdf" ? latest?.pdfPath : latest?.docxPath;
    } else {
      const latest = await prisma.coverLetter.findFirst({
        where: { jobId: job.id },
        orderBy: { version: "desc" },
      });
      filePath = format === "pdf" ? latest?.pdfPath : latest?.docxPath;
    }

    if (!filePath) return res.status(404).json({ error: "Material not generated yet" });

    const storage = getStorage();
    const buffer = await storage.readFile(filePath);
    const mime =
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const filename = path.basename(filePath);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});
