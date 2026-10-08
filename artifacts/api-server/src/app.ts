import express, { type Express } from "express";
import cors from "cors";
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

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve the built frontend files
const frontendDistPath = path.join(__dirname, "..", "..", "ai-recipes", "dist", "public");
app.use(express.static(frontendDistPath));

// Handle client-side routing, return all requests to React app
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(frontendDistPath, "index.html"));
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default app;
