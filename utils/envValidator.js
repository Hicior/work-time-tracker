/**
 * Environment variable validation utility
 * Validates that all required environment variables are present on startup
 * Helps catch configuration issues before the application starts serving requests
 */

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
    'AUTH0_DOMAIN',
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
    console.warn(`⚠️  Warning: NODE_ENV="${nodeEnv}" is not a standard value. Expected: ${validNodeEnvs.join(', ')}`);
  }

  console.log(`✅ Environment validation passed (NODE_ENV: ${nodeEnv})`);
}

module.exports = { validateEnvironmentVariables };

