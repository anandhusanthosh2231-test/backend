import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

export type AuthenticatedRequest = Request & { userId?: string };

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.userId = userId;
  next();
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const userId = req.userId;
  const adminIds = (process.env.CLERK_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!userId || adminIds.length === 0 || !adminIds.includes(userId)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}