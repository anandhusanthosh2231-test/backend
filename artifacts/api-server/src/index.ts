import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env.NODE_ENV === 'development' ? '5000' : (process.env["PORT"] || '5000');
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer() {
  const host = process.env.NODE_ENV === 'development' ? '127.0.0.1' : '0.0.0.0';
  app.listen(port, host, () => {
    logger.info({ port, host }, "Server listening");
  }).on('error', (err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
}

startServer();
