import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { parseCookie, unsignCookie } from "./oauth-session.ts";
import { getSession, isEmailAllowed } from "../services/oauth-admin-auth.ts";

export type AuthenticatedRequest = Request & { userId?: string };

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    req.userId = userId;
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawCookie = parseCookie(req, "admin_session");
    if (!rawCookie) {
      res.status(401).json({ error: "Unauthorized", message: "Admin session required." });
      return;
    }

    const token = unsignCookie(rawCookie);
    if (!token) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid admin session cookie." });
      return;
    }

    const session = getSession(token);
    if (!session || !isEmailAllowed(session.email)) {
      res.status(403).json({ error: "Forbidden", message: "Account is not on admin allow-list." });
      return;
    }

    req.userId = session.email;
    next();
  } catch (err) {
    next(err);
  }
}