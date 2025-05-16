/**
 * Admin API routes for the Work Time Tracker application.
 * Provides endpoints for admin operations including syncing users from Auth0
 * and managing user block status.
 */
const express = require("express");
const router = express.Router();
const {
  getAuth0Users,
  toggleUserBlockedStatus,
} = require("../utils/auth0Utils");
const User = require("../models/User");
const { dbAsync } = require("../db/database");

// Middleware to ensure user is authenticated and an admin
const ensureAdmin = async (req, res, next) => {
  if (!req.oidc.isAuthenticated()) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await User.findByAuth0Id(req.oidc.user.sub);
  if (!user || !user.isAdmin()) {
    return res.status(403).json({ error: "Forbidden - Admin access required" });
  }

  next();
};

// Apply middleware to all routes
router.use(ensureAdmin);

// Sync users from Auth0
router.post("/sync-users", async (req, res) => {
  try {
    // Fetch users from Auth0
    const auth0Users = await getAuth0Users();

    // Sync users to database
    const result = await User.syncAllFromAuth0(auth0Users);

    res.json({
      success: true,
      message: `Synced ${result.successCount} users successfully, ${result.failCount} failed`,
      syncedCount: result.successCount,
      failedCount: result.failCount,
    });
  } catch (error) {
    console.error("Error syncing users from Auth0:", error);
    res.status(500).json({
      error: "Error syncing users from Auth0",
      message: error.message,
    });
  }
});

// Toggle user blocked status (both in database and Auth0)
router.post("/users/:id/toggle-block", async (req, res) => {
  try {
    const userId = req.params.id;

    // Get user from database
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Toggle blocked status
    const newBlockedStatus = !user.is_blocked;

    // Update in Auth0
    await toggleUserBlockedStatus(user.auth0_id, newBlockedStatus);

    // Update in database
    await User.updateBlockStatus(userId, newBlockedStatus);

    res.json({
      success: true,
      message: `User ${
        newBlockedStatus ? "blocked" : "unblocked"
      } successfully`,
      userId: userId,
      isBlocked: newBlockedStatus,
    });
  } catch (error) {
    console.error("Error toggling user block status:", error);
    res.status(500).json({
      error: "Error toggling user block status",
      message: error.message,
    });
  }
});

module.exports = router;
