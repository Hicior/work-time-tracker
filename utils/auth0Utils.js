/**
 * Auth0 Management API utilities for the Work Time Tracker application.
 * Provides functions to interact with the Auth0 Management API for user operations
 * including fetching users and managing their blocked status.
 */
const axios = require("axios");

// Auth0 Configuration
const auth0Config = {
  domain: process.env.AUTH0_MANAGEMENT_DOMAIN || process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_MANAGEMENT_CLIENT_ID,
  clientSecret: process.env.AUTH0_MANAGEMENT_CLIENT_SECRET,
  audience:
    process.env.AUTH0_MANAGEMENT_AUDIENCE ||
    `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
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

  // Validate configuration
  if (
    !auth0Config.domain ||
    !auth0Config.clientId ||
    !auth0Config.clientSecret ||
    !auth0Config.audience
  ) {
    console.error("Auth0 Management API configuration is incomplete:", {
      domain: !!auth0Config.domain,
      clientId: !!auth0Config.clientId,
      clientSecret: !!auth0Config.clientSecret,
      audience: !!auth0Config.audience,
    });
    throw new Error("Auth0 Management API configuration is incomplete");
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
 * Fetch users from Auth0 with pagination to get all users
 * @returns {Promise<Array>} List of all Auth0 users
 */
async function getAuth0Users() {
  try {
    const token = await getManagementApiToken();
    const allUsers = [];
    let page = 0;
    const perPage = 100; // Maximum allowed per page
    let hasMoreUsers = true;

    while (hasMoreUsers) {
      const response = await axios.get(
        `https://${auth0Config.domain}/api/v2/users`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          params: {
            page: page,
            per_page: perPage,
            include_totals: true,
          },
        }
      );

      const { users, total, start, length } = response.data;

      // Add users from this page to our collection
      allUsers.push(...users);

      // Check if we have more pages to fetch
      hasMoreUsers = start + length < total && length === perPage;
      page++;

      // Safety check to prevent infinite loops (Auth0 has a 1000 user limit anyway)
      if (page > 10) {
        console.warn(
          "Auth0 user sync: Reached maximum page limit (1000 users). Stopping pagination."
        );
        break;
      }
    }

    return allUsers;
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
 * @param {string} userId - Auth0 user ID (e.g., "auth0|680e7367e59f4f4d6e9c8c3e")
 * @param {boolean} blocked - Whether to block or unblock the user
 * @returns {Promise<Object>} Updated user object
 */
async function toggleUserBlockedStatus(userId, blocked) {
  try {
    const token = await getManagementApiToken();

    // Ensure the payload is properly formatted
    const payload = { blocked: Boolean(blocked) };

    const response = await axios.patch(
      `https://${auth0Config.domain}/api/v2/users/${encodeURIComponent(
        userId
      )}`,
      payload,
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
      console.error("Auth0 API Error:", {
        status: error.response.status,
        data: error.response.data,
        userId: userId,
        blocked: Boolean(blocked),
      });
    }
    throw new Error(`Could not ${blocked ? "block" : "unblock"} Auth0 user`);
  }
}

module.exports = {
  getAuth0Users,
  toggleUserBlockedStatus,
};
