/**
 * Asset versioning utility for cache busting
 * Generates version strings based on package version and build time
 */

const packageJson = require('../package.json');
const crypto = require('crypto');

// Generate a hash from package version for cache busting
const ASSET_VERSION = crypto
  .createHash('md5')
  .update(packageJson.version + (process.env.BUILD_TIME || Date.now().toString()))
  .digest('hex')
  .substring(0, 8);

/**
 * Adds a version query string to an asset path for cache busting
 * @param {string} assetPath - The path to the asset (e.g., '/css/output.css')
 * @returns {string} - The asset path with version query string (e.g., '/css/output.css?v=abc12345')
 */
function versionedAsset(assetPath) {
  return `${assetPath}?v=${ASSET_VERSION}`;
}

module.exports = { ASSET_VERSION, versionedAsset };

