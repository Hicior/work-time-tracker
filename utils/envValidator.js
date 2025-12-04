/**
 * Environment variable validation utility
 * Validates that all required environment variables are present on startup
 * Helps catch configuration issues before the application starts serving requests
 */
const logger = require("./logger").createModuleLogger("EnvValidator");

/**
 * Validates that all required environment variables are present
 * @throws {Error} If any required environment variable is missing
 */
function validateEnvironmentVariables() {
  const requiredEnvVars = [
    'DATABASE_URL',
    'AUTH0_SECRET',
    'AUTH0_BASE_URL',
    'AUTH0_CLIENT_ID',
    'AUTH0_CLIENT_SECRET',
    'AUTH0_DOMAIN',
    'AUTH0_MANAGEMENT_CLIENT_ID',
    'AUTH0_MANAGEMENT_CLIENT_SECRET',
    'CSRF_COOKIE_SECRET',
  ];

  const missingVars = [];

  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    const errorMessage = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  ENVIRONMENT CONFIGURATION ERROR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Missing required environment variables:
${missingVars.map(v => `  ❌ ${v}`).join('\n')}

Please ensure all required environment variables are set.
Check the env.example.txt file for reference.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    throw new Error(errorMessage);
  }

  // Validate NODE_ENV is set to a valid value
  const validNodeEnvs = ['development', 'production', 'test'];
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (!validNodeEnvs.includes(nodeEnv)) {
    logger.warn({ nodeEnv, validNodeEnvs }, 'NODE_ENV is not a standard value');
  }

  logger.info({ nodeEnv }, 'Environment validation passed');
}

module.exports = { validateEnvironmentVariables };

