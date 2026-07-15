import type { Request, Response, NextFunction } from "express";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.API_SECRET ?? "change-me";
  const header = req.headers["x-api-secret"];
  if (header !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
