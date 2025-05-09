/**
 * Routes for public holidays management in the Work Time Tracker application.
 * Handles all public holiday operations including adding, deleting, and displaying.
 * These public holidays apply to all users within the system.
 */

const express = require("express");
const router = express.Router();
const PublicHoliday = require("../models/PublicHoliday");
const { prepareMessages } = require("../utils/messageUtils");

// Display public holidays admin page
router.get("/", async (req, res) => {
  try {
    // Get the current year
    const currentYear = new Date().getFullYear();

    // Query parameter for year filtering, default to current year
    const year = req.query.year ? parseInt(req.query.year) : currentYear;

    // Get public holidays for the year
    const publicHolidays = await PublicHoliday.findByYear(year);

    // Prepare year range for dropdown (current year and next 2 years)
    const years = [
      currentYear - 1,
      currentYear,
      currentYear + 1,
      currentYear + 2,
    ];

    res.render("admin/public-holidays", {
      title: "Zarządzanie Dniami Ustawowo Wolnymi",
      currentPage: "admin",
      publicHolidays,
      selectedYear: year,
      years,
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user,
      messages: prepareMessages(req.query),
    });
  } catch (error) {
    console.error("Error loading public holidays admin page:", error);
    res.status(500).render("error", {
      title: "Błąd",
      message:
        "Nie udało się załadować strony zarządzania dniami ustawowo wolnymi",
      error: error,
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      currentPage: "admin",
      dbUser: req.user,
    });
  }
});

// Add public holiday
router.post("/", async (req, res) => {
  try {
    const { name, holiday_date } = req.body;

    // Validate input
    if (!name || !holiday_date) {
      return res.redirect("/admin/public-holidays?error=invalid_input");
    }

    // Create public holiday
    await PublicHoliday.create({
      name,
      holiday_date,
    });

    res.redirect("/admin/public-holidays?success=added");
  } catch (error) {
    console.error("Error adding public holiday:", error);
    res.redirect("/admin/public-holidays?error=failed");
  }
});

// Delete public holiday
router.post("/:id/delete", async (req, res) => {
  try {
    const { id } = req.params;

    // Find the public holiday
    const publicHoliday = await PublicHoliday.findById(id);

    // Check if holiday exists
    if (!publicHoliday) {
      return res.redirect("/admin/public-holidays?error=not_found");
    }

    // Delete the holiday
    await publicHoliday.delete();

    res.redirect("/admin/public-holidays?success=deleted");
  } catch (error) {
    console.error("Error deleting public holiday:", error);
    res.redirect("/admin/public-holidays?error=failed");
  }
});

module.exports = router;
