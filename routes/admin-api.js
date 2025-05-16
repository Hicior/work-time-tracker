/**
 * Routes for administrative API endpoints in the Work Time Tracker application.
 * Handles administrative tasks like user management and Auth0 synchronization.
 * Requires elevated permissions (admin or manager) to access.
 */

const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { auth0ManagementClient } = require("../utils/auth0Utils"); // Import Auth0 management client

// API endpoint to sync users from Auth0
router.post("/sync-users", async (req, res) => {
  try {
    // Check if the user has admin privileges
    if (!req.user.isAdmin()) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get users from Auth0
    const auth0Users = await auth0ManagementClient.getUsers();

    // Sync users to our database
    const result = await User.bulkSyncFromAuth0(auth0Users);

    return res.json({
      success: true,
      message: `Synchronized ${result.length} users from Auth0`,
      users: result,
    });
  } catch (error) {
    console.error("Error syncing users from Auth0:", error);
    return res.status(500).json({ error: "Failed to sync users" });
  }
});

// API endpoint to block/unblock a user
router.post("/users/:id/toggle-block", async (req, res) => {
  try {
    // Check if the user has admin privileges
    if (!req.user.isAdmin()) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const { blocked } = req.body;

    // Get the user to update
    const userToUpdate = await User.findById(id);
    if (!userToUpdate) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update the user's block status both in our DB and in Auth0
    await userToUpdate.setBlockedStatus(blocked);

    // Update the user in Auth0
    await auth0ManagementClient.updateUser({
      id: userToUpdate.auth0_id,
      blocked,
    });

    return res.json({
      success: true,
      message: blocked
        ? "User blocked successfully"
        : "User unblocked successfully",
      user: {
        id: userToUpdate.id,
        email: userToUpdate.email,
        blocked: userToUpdate.blocked,
      },
    });
  } catch (error) {
    console.error("Error toggling user block status:", error);
    return res.status(500).json({ error: "Failed to update user status" });
  }
});

module.exports = router;
