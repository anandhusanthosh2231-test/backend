import express, { type Express } from "express";
import cors from "cors";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import { clerkMiddleware } from "@clerk/express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

// Check admin environment variables
if (!process.env.ADMIN_INITIAL_PASSWORD) {
  logger.warn("ADMIN_INITIAL_PASSWORD env var is not set. Initial admin password will not be seeded.");
}
if (!process.env.ADMIN_ALLOWED_IPS) {
  logger.warn("ADMIN_ALLOWED_IPS env var is not set. Admin IP restriction is disabled.");
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors());
const defaultJsonParser = express.json();
const csvImportJsonParser = express.json({ limit: "5mb" });
app.use((req, res, next) => {
  const parser = req.path === "/api/admin/recipes/import-csv" ? csvImportJsonParser : defaultJsonParser;
  parser(req, res, next);
});
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware());

app.use("/api", router);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve the built frontend files only when the bundle actually exists.
// In a separate frontend deployment (Cloudflare Pages / Vercel), the backend API
// should not crash just because the frontend build folder is absent.
const frontendDistPath = path.join(__dirname, "..", "..", "ai-recipes", "dist", "public");
const frontendIndexPath = path.join(frontendDistPath, "index.html");
const hasFrontendBuild = fs.existsSync(frontendIndexPath);

if (hasFrontendBuild) {
  app.use(express.static(frontendDistPath));

  app.get(/.*/, (req, res) => {
    res.sendFile(frontendIndexPath);
  });
} else {
  app.get("/", (req, res) => {
    res.json({
      ok: true,
      service: "ai-recipes-api",
      message: "API is running. Frontend build not attached in this deployment.",
      apiUrl: process.env.API_URL || null,
    });
  });

  app.get(/^(?!\/api).*/, (req, res) => {
    res.status(404).json({
      error: "Frontend build not found for this deployment.",
      apiOnly: true,
      message: "The API is running, but this Render service is not serving a frontend bundle.",
    });
  });
}

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default app;
