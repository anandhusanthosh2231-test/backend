import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { adminAuthService } from "../services/admin-auth";
import { requireAdmin, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

router.post("/admin/auth/login", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const ip = getClientIp(req);

    const rateCheck = adminAuthService.checkLoginRateLimit(ip);
    if (!rateCheck.allowed) {
      const retryAfterSec = Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000);
      res.status(429).json({
        error: `Too many failed login attempts. Please try again in ${retryAfterSec} seconds.`,
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required." });
      return;
    }

    const isValid = await adminAuthService.verifyCredentials(String(username), String(password));
    if (!isValid) {
      adminAuthService.recordFailedLogin(ip);
      res.status(401).json({ error: "Invalid admin username or password." });
      return;
    }

    adminAuthService.resetLoginAttempts(ip);

    const settings = await adminAuthService.getSettings(String(username));
    if (!settings) {
      res.status(500).json({ error: "Internal server error." });
      return;
    }

    if (settings.mfaEnabled) {
      const challenge = await adminAuthService.createMfaChallenge(String(username));
      res.json({
        mfaRequired: true,
        message: `Verification code sent to registered contact number ${challenge.maskedPhone}`,
        tempToken: challenge.tempToken,
        maskedPhone: challenge.maskedPhone,
        expiresInSeconds: challenge.expiresInSeconds,
      });
      return;
    }

    const token = await adminAuthService.createDirectSession(String(username));
    res.json({
      mfaRequired: false,
      token,
      user: {
        username: settings.username,
        phoneNumber: settings.phoneNumber,
        mfaEnabled: false,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/admin/auth/verify-mfa", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { tempToken, otp } = req.body || {};
    if (!tempToken || !otp) {
      res.status(400).json({ error: "Temporary token and 6-digit OTP code are required." });
      return;
    }

    const result = await adminAuthService.verifyMfa(String(tempToken), String(otp));
    if (!result.success) {
      res.status(401).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/admin/auth/resend-otp", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { tempToken } = req.body || {};
    if (!tempToken) {
      res.status(400).json({ error: "Temporary token is required to resend OTP." });
      return;
    }

    const result = await adminAuthService.resendMfaOtp(String(tempToken));
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      message: `A new 6-digit verification code was sent to ${result.maskedPhone}`,
      maskedPhone: result.maskedPhone,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/admin/auth/verify-passkey", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { passkey } = req.body || {};
    if (!passkey) {
      res.status(400).json({ error: "Passkey is required." });
      return;
    }

    const isValid = adminAuthService.verifyPasskey(String(passkey));
    if (!isValid) {
      res.status(401).json({ error: "Invalid passkey." });
      return;
    }

    const token = await adminAuthService.createDirectSession("master_admin");
    res.json({
      success: true,
      token,
      user: {
        username: "master_admin",
        phoneNumber: "",
        mfaEnabled: false,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/admin/auth/settings", requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const username = req.userId === "admin_master" ? (process.env.ADMIN_INITIAL_USERNAME || "admin") : req.userId!;
    const settings = await adminAuthService.getSettings(username);
    if (!settings) {
      res.status(404).json({ error: "Settings not found." });
      return;
    }
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

router.post("/admin/auth/settings", requireAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const username = req.userId === "admin_master" ? (process.env.ADMIN_INITIAL_USERNAME || "admin") : req.userId!;
    const result = await adminAuthService.updateSettings(username, req.body || {});
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/admin/auth/logout", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      await adminAuthService.logout(authHeader);
    } else {
      const customHeader = req.headers["x-admin-token"];
      if (typeof customHeader === "string") {
        await adminAuthService.logout(customHeader);
      }
    }
    res.json({ success: true, message: "Logged out successfully." });
  } catch (err) {
    next(err);
  }
});

export default router;
