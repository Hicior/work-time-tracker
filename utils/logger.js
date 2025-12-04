/**
 * Centralized logging module using Pino.
 * Provides structured JSON logging for production and pretty-printed logs for development.
 * 
 * Usage:
 *   const logger = require('./utils/logger');
 *   logger.info('Server started');
 *   logger.error({ err, userId }, 'Failed to process request');
 * 
 * For module-specific logging, create a child logger:
 *   const logger = require('./utils/logger').child({ module: 'WorkHours' });
 */
const pino = require('pino');

const isDevelopment = process.env.NODE_ENV !== 'production';

// Configure Pino options
const pinoOptions = {
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  
  // Custom timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,
  
  // Redact sensitive fields from logs
  redact: {
    paths: [
      // HTTP headers with sensitive data
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      // Generic sensitive field names
      'password',
      'secret',
      'token',
      // Auth0 specific fields
      'auth0_id',
      'access_token',
      'accessToken',
      'refresh_token',
      'refreshToken',
      'id_token',
      'idToken',
      'client_secret',
      'clientSecret',
      // Session and API keys
      'sessionId',
      'session_id',
      'apiKey',
      'api_key',
      // Nested paths for error response data that might leak secrets
      '*.access_token',
      '*.refresh_token',
      '*.id_token',
      '*.client_secret',
    ],
    censor: '[REDACTED]',
  },
  
  // Custom serializers for consistent log format
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  
  // Base properties included in every log
  base: {
    pid: process.pid,
    env: process.env.NODE_ENV || 'development',
  },
};

// In development, use pino-pretty for human-readable output
// In production, output JSON for log aggregation services
const transport = isDevelopment
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname,env',
        messageFormat: '{module}: {msg}',
        errorLikeObjectKeys: ['err', 'error'],
      },
    }
  : undefined;

// Create the logger instance
const logger = pino(pinoOptions, transport ? pino.transport(transport) : undefined);

/**
 * Create a child logger with module context.
 * @param {string} moduleName - Name of the module for log filtering
 * @returns {pino.Logger} Child logger instance
 * 
 * @example
 * const log = require('./utils/logger').createModuleLogger('WorkHours');
 * log.info({ userId: 123 }, 'Work hours created');
 */
function createModuleLogger(moduleName) {
  return logger.child({ module: moduleName });
}

// Export the logger and helper functions
module.exports = logger;
module.exports.createModuleLogger = createModuleLogger;

