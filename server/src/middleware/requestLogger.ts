import pinoHttp from 'pino-http';
import { logger } from '../lib/logger.js';

export const requestLogger = pinoHttp({
  logger,
  customProps: (req) => ({
    endpoint: req.url,
  }),
});
