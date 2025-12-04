/**
 * Routes for administrative API endpoints in the Work Time Tracker application.
 * Handles administrative tasks like user management and Auth0 synchronization.
 * Requires elevated permissions (admin or manager) to access.
 */

const express = require("express");
const router = express.Router();
const User = require("../models/User");
const {
  getAuth0Users,
  toggleUserBlockedStatus,
} = require("../utils/auth0Utils"); // Import Auth0 utilities

// API endpoint to sync users from Auth0
router.post("/sync-users", async (req, res) => {
  try {
    // Check if the user has admin privileges
    if (!req.user.isAdmin()) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get users from Auth0
    const auth0Users = await getAuth0Users();

    // Sync users to our database
    const result = await User.syncAllFromAuth0(auth0Users);

    return res.json({
      success: true,
      message: `Synchronized ${result.successCount} users from Auth0 (${result.failCount} failed)`,
      result: result,
    });
  } catch (_error) {
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

    // Check if user has auth0_id
    if (!userToUpdate.auth0_id) {
      return res.status(400).json({
        error: "User does not have Auth0 ID - cannot update Auth0 status",
      });
    }

    // Update the user's block status in our database
    await User.updateBlockStatus(userToUpdate.id, blocked);

    // Update the user in Auth0
    await toggleUserBlockedStatus(userToUpdate.auth0_id, blocked);

    // Get updated user data
    const updatedUser = await User.findById(id);

    return res.json({
      success: true,
      message: blocked
        ? "User blocked successfully"
        : "User unblocked successfully",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        blocked: updatedUser.is_blocked,
      },
    });
  } catch (_error) {
    return res.status(500).json({ error: "Failed to update user status" });
  }
});

// API endpoint to update a user's name
router.post("/users/:id/update-name", async (req, res) => {
  try {
    // Check if the user has admin privileges
    if (!req.user.isAdmin()) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Imię i nazwisko nie może być puste",
      });
    }

    // Get the user to update
    const userToUpdate = await User.findById(id);
    if (!userToUpdate) {
      return res.status(404).json({
        success: false,
        message: "Nie znaleziono użytkownika",
      });
    }

    // Update the user's name
    const updated = await userToUpdate.update({ name: name.trim() });

    if (!updated) {
      return res.status(500).json({
        success: false,
        message: "Nie udało się zaktualizować imienia i nazwiska",
      });
    }

    return res.json({
      success: true,
      message: "Imię i nazwisko zaktualizowane pomyślnie",
      user: {
        id: userToUpdate.id,
        name: userToUpdate.name,
      },
    });
  } catch (_error) {
    return res.status(500).json({
      success: false,
      message: "Wystąpił błąd podczas aktualizacji",
    });
  }
});

module.exports = router;
