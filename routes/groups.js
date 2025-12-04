/**
 * Routes for group management in the Work Time Tracker application.
 * Provides APIs for creating, reading, updating, and deleting user groups.
 * Restricted to admin users only, these endpoints manage the organizational structure
 * by allowing administrators to create and manage groups/teams.
 */
const express = require("express");
const router = express.Router();
const Group = require("../models/Group");
const User = require("../models/User");
const { formatDateTimeForDisplay } = require("../utils/dateUtils");
const { prepareMessages } = require("../utils/messageUtils");

// Get all groups (Admin only)
router.get("/", async (req, res) => {
  try {
    const groups = await Group.findAll();
    const users = await User.getAll();

    res.render("admin/groups", {
      title: "Zarządzanie Grupami",
      currentPage: "admin-groups",
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user,
      groups: groups,
      users: users,
      formatDateTimeForDisplay,
      messages: prepareMessages(req.query),
    });
  } catch (_error) {
    res.status(500).send("Nie udało się załadować grup");
  }
});

// Create a new group
router.post("/", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).send("Nazwa grupy jest wymagana");
    }

    await Group.create({ name: name.trim() });
    res.redirect("/admin/groups?success=group_created");
  } catch (_error) {
    res.status(500).send("Nie udało się utworzyć grupy");
  }
});

// Assign user to group (MOVED UP before the /:id route)
router.post("/assign-user", async (req, res) => {
  try {
    const { userId, groupId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send("Użytkownik nie został znaleziony");
    }

    // If groupId is empty string or null, set group_id to null (remove from group)
    const group_id = groupId === "" ? null : groupId;

    // If group_id is not null, verify group exists
    if (group_id !== null) {
      const group = await Group.findById(group_id);
      if (!group) {
        return res.status(404).send("Grupa nie została znaleziona");
      }
    }

    await user.update({ group_id });
    res.redirect("/admin/groups?success=user_assigned");
  } catch (_error) {
    res.status(500).send("Nie udało się przypisać użytkownika do grupy");
  }
});

// Update group name
router.post("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).send("Nazwa grupy jest wymagana");
    }

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).send("Grupa nie została znaleziona");
    }

    await group.update({ name: name.trim() });
    res.redirect("/admin/groups?success=group_updated");
  } catch (_error) {
    res.status(500).send("Nie udało się zaktualizować grupy");
  }
});

// Delete group
router.post("/:id/delete", async (req, res) => {
  try {
    const { id } = req.params;

    const group = await Group.findById(id);
    if (!group) {
      return res.status(404).send("Grupa nie została znaleziona");
    }

    await group.delete();
    res.redirect("/admin/groups?success=group_deleted");
  } catch (error) {
    if (error.message === "Cannot delete group with assigned users") {
      return res.redirect("/admin/groups?error=group_has_users");
    }

    res.status(500).send("Nie udało się usunąć grupy");
  }
});

module.exports = router;
