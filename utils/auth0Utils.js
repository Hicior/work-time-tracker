/**
 * Auth0 Management API utilities for the Work Time Tracker application.
 * Provides functions to interact with the Auth0 Management API for user operations
 * including fetching users and managing their blocked status.
 */
const axios = require("axios");

// Auth0 Configuration
const auth0Config = {
  domain: process.env.AUTH0_MANAGEMENT_DOMAIN,
  clientId: process.env.AUTH0_MANAGEMENT_CLIENT_ID,
  clientSecret: process.env.AUTH0_MANAGEMENT_CLIENT_SECRET,
  audience: process.env.AUTH0_MANAGEMENT_AUDIENCE,
};

// Token cache
let managementApiToken = null;
let tokenExpiry = null;

/**
 * Get an Auth0 Management API token
 * @returns {Promise<string>} Auth0 Management API token
 */
async function getManagementApiToken() {
  // Check if we have a valid token already
  if (managementApiToken && tokenExpiry && Date.now() < tokenExpiry) {
    return managementApiToken;
  }

  try {
    const response = await axios.post(
      `https://${auth0Config.domain}/oauth/token`,
      {
        client_id: auth0Config.clientId,
        client_secret: auth0Config.clientSecret,
        audience: auth0Config.audience,
        grant_type: "client_credentials",
      }
    );

    managementApiToken = response.data.access_token;
    // Set expiry time (token lifetime minus 5 minutes for safety margin)
    tokenExpiry = Date.now() + response.data.expires_in * 1000 - 5 * 60 * 1000;

    return managementApiToken;
  } catch (error) {
    console.error("Error obtaining Auth0 Management API token:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
    }
    throw new Error("Could not obtain Auth0 Management API token");
  }
}

/**
 * Fetch users from Auth0
 * @returns {Promise<Array>} List of Auth0 users
 */
async function getAuth0Users() {
  try {
    const token = await getManagementApiToken();

    const response = await axios.get(
      `https://${auth0Config.domain}/api/v2/users`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error fetching Auth0 users:", error.message);
    if (error.response) {
      console.error("Response data:", error.response.data);
    }
    throw new Error("Could not fetch Auth0 users");
  }
}

/**
 * Toggle user blocked status in Auth0
 * @param {string} userId - Auth0 user ID
 * @param {boolean} blocked - Whether to block or unblock the user
 * @returns {Promise<Object>} Updated user object
 */
async function toggleUserBlockedStatus(userId, blocked) {
  try {
    const token = await getManagementApiToken();

    const response = await axios.patch(
      `https://${auth0Config.domain}/api/v2/users/${userId}`,
      { blocked },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      `Error ${blocked ? "blocking" : "unblocking"} Auth0 user:`,
      error.message
    );
    if (error.response) {
      console.error("Response data:", error.response.data);
    }
    throw new Error(`Could not ${blocked ? "block" : "unblock"} Auth0 user`);
  }
}

module.exports = {
  getAuth0Users,
  toggleUserBlockedStatus,
};
