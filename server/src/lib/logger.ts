import pino from 'pino';

// paths are matched against the shape the serializers emit, not the raw Express
// objects — pino-http nests request data one level down under `req`
const REDACT_PATHS: string[] = ['req.headers.authorization', 'req.headers.cookie'];

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
});
