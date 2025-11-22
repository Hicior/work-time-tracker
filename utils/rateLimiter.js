/**
 * Rate limiting middleware configurations for protecting endpoints from abuse.
 * Uses express-rate-limit to implement sliding window rate limiting.
 */
const rateLimit = require('express-rate-limit');

/**
 * Strict rate limiter for authentication endpoints (login, callback).
 * Prevents brute force attacks on authentication flows.
 * 
 * Limit: 
 * - Development: 100 requests per 15 minutes per IP (permissive for testing)
 * - Production: 15 requests per 15 minutes per IP (strict security)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 15 : 100, // More permissive in development
  message: 'Zbyt wiele prób logowania z tego adresu IP. Spróbuj ponownie później.',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Trust proxy is already set in index.js, so IP will be correctly detected
});

/**
 * Moderate rate limiter for API endpoints.
 * Protects admin API routes from excessive requests.
 * 
 * Limit: 150 requests per 15 minutes per IP
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150, // Limit each IP to 150 requests per windowMs
  message: 'Zbyt wiele żądań API z tego adresu IP. Spróbuj ponownie później.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General rate limiter for other protected routes.
 * Provides baseline protection without being too restrictive.
 * 
 * Limit: 200 requests per 15 minutes per IP
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: 'Zbyt wiele żądań z tego adresu IP. Spróbuj ponownie później.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for health check endpoint.
 * More permissive than auth endpoints to allow frequent monitoring checks,
 * but still provides protection against abuse.
 * 
 * Limit: 60 requests per minute per IP
 */
const healthCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per minute
  message: 'Zbyt wiele żądań sprawdzenia stanu z tego adresu IP. Spróbuj ponownie później.',
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  apiLimiter,
  generalLimiter,
  healthCheckLimiter,
};

