import { Router } from "express";
import { prisma } from "@job-agent/db";
import { userProfileSchema } from "@job-agent/shared";

export const profileRouter = Router();

profileRouter.get("/", async (_req, res, next) => {
  try {
    const profile = await prisma.userProfile.findFirst();
    res.json(profile);
  } catch (e) {
    next(e);
  }
});

profileRouter.put("/", async (req, res, next) => {
  try {
    const data = userProfileSchema.parse(req.body);
    const existing = await prisma.userProfile.findFirst();
    const profile = existing
      ? await prisma.userProfile.update({
          where: { id: existing.id },
          data: {
            email: data.email,
            targetRoles: data.targetRoles,
            targetLocations: data.targetLocations,
            minSalaryAud: data.minSalaryAud ?? null,
            visaSponsorshipRequired: data.visaSponsorshipRequired,
            preferredWorkType: data.preferredWorkType,
            skills: data.skills,
          },
        })
      : await prisma.userProfile.create({ data });
    res.json(profile);
  } catch (e) {
    next(e);
  }
});
