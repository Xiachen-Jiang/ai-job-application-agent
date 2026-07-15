import { prisma, ApplicationStatus, Prisma } from "@job-agent/db";
import ExcelJS from "exceljs";
import {
  type AgentDefinition,
  applicationCreateSchema,
  applicationUpdateSchema,
} from "@job-agent/shared";
import { z } from "zod";

const exportInputSchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
});

const exportOutputSchema = z.object({
  content: z.string().optional(),
  buffer: z.instanceof(Buffer).optional(),
  mimeType: z.string(),
  filename: z.string(),
});

export type TrackingExportInput = z.infer<typeof exportInputSchema>;
export type TrackingExportOutput = z.infer<typeof exportOutputSchema>;

const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  SAVED: ["APPLIED", "REJECTED"],
  APPLIED: ["INTERVIEW", "REJECTED"],
  INTERVIEW: ["OFFER", "REJECTED"],
  REJECTED: [],
  OFFER: [],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from].includes(to);
}

type ApplicationWithRelations = Prisma.ApplicationGetPayload<{
  include: { job: true; resumeVersion: true; coverLetter: true };
}>;

export async function createApplication(
  input: z.infer<typeof applicationCreateSchema>
): Promise<ApplicationWithRelations> {
  return prisma.application.create({
    data: {
      jobId: input.jobId,
      company: input.company,
      role: input.role,
      status: input.status,
      notes: input.notes,
      resumeVersionId: input.resumeVersionId,
      coverLetterId: input.coverLetterId,
    },
    include: {
      job: true,
      resumeVersion: true,
      coverLetter: true,
    },
  });
}

export async function updateApplication(
  id: string,
  input: z.infer<typeof applicationUpdateSchema>
): Promise<ApplicationWithRelations> {
  const existing = await prisma.application.findUniqueOrThrow({ where: { id } });
  if (input.status && !canTransition(existing.status, input.status)) {
    throw new Error(`Invalid status transition from ${existing.status} to ${input.status}`);
  }

  return prisma.application.update({
    where: { id },
    data: {
      status: input.status,
      appliedDate: input.appliedDate === null ? null : input.appliedDate ? new Date(input.appliedDate) : undefined,
      followUpDate:
        input.followUpDate === null ? null : input.followUpDate ? new Date(input.followUpDate) : undefined,
      notes: input.notes,
      resumeVersionId: input.resumeVersionId === null ? null : input.resumeVersionId,
      coverLetterId: input.coverLetterId === null ? null : input.coverLetterId,
    },
    include: {
      job: true,
      resumeVersion: true,
      coverLetter: true,
    },
  });
}

export async function listApplications(): Promise<ApplicationWithRelations[]> {
  return prisma.application.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      job: true,
      resumeVersion: true,
      coverLetter: true,
    },
  });
}

async function buildRows() {
  const apps = await listApplications();
  return apps.map((app) => ({
    id: app.id,
    company: app.company,
    role: app.role,
    status: app.status,
    applied_date: app.appliedDate?.toISOString().slice(0, 10) ?? "",
    follow_up_date: app.followUpDate?.toISOString().slice(0, 10) ?? "",
    resume_version: app.resumeVersion?.version ?? "",
    cover_letter_version: app.coverLetter?.version ?? "",
    resume_path: app.resumeVersion?.docxPath ?? "",
    cover_letter_path: app.coverLetter?.docxPath ?? "",
    notes: app.notes ?? "",
  }));
}

export const trackingExportAgent: AgentDefinition<TrackingExportInput, TrackingExportOutput> = {
  name: "tracking-agent",
  inputSchema: exportInputSchema,
  outputSchema: exportOutputSchema,
  async execute(input) {
    const rows = await buildRows();
    const timestamp = new Date().toISOString().slice(0, 10);

    if (input.format === "csv") {
      const headers = Object.keys(rows[0] ?? { id: "", company: "", role: "", status: "" });
      const csv = [
        headers.join(","),
        ...rows.map((row) =>
          headers.map((h) => `"${String((row as Record<string, unknown>)[h] ?? "").replace(/"/g, '""')}"`).join(",")
        ),
      ].join("\n");
      return {
        content: csv,
        mimeType: "text/csv",
        filename: `applications-${timestamp}.csv`,
      };
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Applications");
    if (rows.length > 0) {
      sheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key, width: 20 }));
      sheet.addRows(rows);
    }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `applications-${timestamp}.xlsx`,
    };
  },
};

export {
  applicationCreateSchema,
  applicationUpdateSchema,
  exportInputSchema as trackingExportInputSchema,
  exportOutputSchema as trackingExportOutputSchema,
};
