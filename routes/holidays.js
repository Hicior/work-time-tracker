/**
 * Routes for holidays management in the Work Time Tracker application.
 * Handles all holiday tracking functionality including adding, deleting, and displaying holiday history.
 * Provides views for displaying holidays and statistics.
 */

const express = require("express");
const router = express.Router();
const Holiday = require("../models/Holiday");
const PublicHoliday = require("../models/PublicHoliday");
const WorkHours = require("../models/WorkHours");
const {
  getWeekdaysInMonth,
  formatDate,
  formatDateForDisplay,
} = require("../utils/dateUtils");
const { prepareMessages } = require("../utils/messageUtils");

// Helper function to generate dates between start and end date (inclusive)
const generateDateRange = (startDate, endDate) => {
  const dates = [];
  const currentDate = new Date(startDate);
  const lastDate = new Date(endDate);

  // Add dates until we reach the end date
  while (currentDate <= lastDate) {
    const dayOfWeek = currentDate.getDay();
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      dates.push(formatDate(new Date(currentDate)));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
};

// Helper function to get current month info
const getCurrentMonthInfo = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // JavaScript months are 0-indexed

  // Format month to ensure it's 2 digits
  const formattedMonth = month.toString().padStart(2, "0");

  // Create date objects for first and last day of month
  const firstDayObj = new Date(year, month - 1, 1);
  const lastDayObj = new Date(year, month, 0);

  return {
    year,
    month,
    firstDay: formatDate(firstDayObj),
    lastDay: formatDate(lastDayObj),
    formattedMonth,
  };
};

// Display holidays page
router.get("/", async (req, res) => {
  try {
    // Get authenticated user ID
    const userId = req.user.id;
    const { year, month, firstDay, lastDay } = getCurrentMonthInfo();

    // Get holidays for the current month
    const holidays = await Holiday.findByUserAndDateRange(
      userId,
      firstDay,
      lastDay
    );

    // Format holiday dates for display
    holidays.forEach((holiday) => {
      holiday.holiday_date = formatDateForDisplay(holiday.holiday_date);
    });

    // Get public holidays for the current month
    const rawPublicHolidays = await PublicHoliday.findByMonthAndYear(
      month,
      year
    );

    // Create a version for display formatting to be passed to the template
    const displayPublicHolidays = rawPublicHolidays.map((h) => ({
      ...h,
      holiday_date: formatDateForDisplay(h.holiday_date),
    }));

    // Get work hours total for the month
    const totalWorkHours = await WorkHours.getTotalMonthlyHours(
      userId,
      year,
      month
    );

    // Get holiday count for the month
    const holidayCount = holidays.length;
    const publicHolidayCount = rawPublicHolidays.length; // Based on raw full list

    // Calculate stats
    const hoursPerDay = 8; // Standard work hours per day
    const workDaysInMonth = getWeekdaysInMonth(year, month);

    // Filter public holidays that fall on weekdays using the raw dates
    const publicHolidaysOnWorkdays = rawPublicHolidays.filter((holiday) => {
      const date = new Date(holiday.holiday_date); // Use original holiday_date
      const dayOfWeek = date.getDay();
      return dayOfWeek !== 0 && dayOfWeek !== 6; // 0 = Sunday, 6 = Saturday
    });

    const publicHolidaysOnWorkdaysCount = publicHolidaysOnWorkdays.length;
    // Subtract all public holidays from required monthly hours
    const requiredMonthlyHours =
      (workDaysInMonth - publicHolidayCount) * hoursPerDay;

    const totalHolidayHours = holidayCount * hoursPerDay;
    // publicHolidayHours should still be based on holidays that grant a day off work
    const publicHolidayHours = publicHolidaysOnWorkdaysCount * hoursPerDay;

    // Don't include public holidays in total combined hours
    const totalCombinedHours = totalWorkHours + totalHolidayHours;

    // Calculate remaining hours - don't include public holidays in the combined hours
    const remainingHours = Math.max(
      0,
      requiredMonthlyHours - totalCombinedHours
    );

    res.render("holidays/index", {
      title: "Urlopy",
      currentPage: "holidays",
      holidays,
      publicHolidays: displayPublicHolidays, // Pass the display-formatted list
      month,
      year,
      stats: {
        totalWorkHours: Math.round(totalWorkHours * 100) / 100,
        holidayCount,
        publicHolidayCount: publicHolidaysOnWorkdaysCount, // Changed to use workday holidays only
        publicHolidaysOnWorkdays: publicHolidaysOnWorkdaysCount, // Count of public holidays on workdays
        totalHolidayHours,
        publicHolidayHours, // Hours based on workday public holidays
        totalCombinedHours: Math.round(totalCombinedHours * 100) / 100,
        requiredMonthlyHours, // Pass the calculated required hours
        remainingHours: Math.round(remainingHours * 100) / 100,
      },
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user, // Pass database user
      messages: prepareMessages(req.query),
    });
  } catch (error) {
    console.error("Error loading holidays:", error);
    const { year, month } = getCurrentMonthInfo(); // Get current month/year for error case
    const workDaysInMonth = getWeekdaysInMonth(year, month);
    const requiredMonthlyHours = workDaysInMonth * 8;

    res.render("holidays/index", {
      title: "Urlopy",
      currentPage: "holidays",
      holidays: [],
      publicHolidays: [],
      month,
      year,
      stats: {
        totalWorkHours: 0,
        holidayCount: 0,
        publicHolidayCount: 0,
        publicHolidaysOnWorkdays: 0,
        totalHolidayHours: 0,
        publicHolidayHours: 0,
        totalCombinedHours: 0,
        requiredMonthlyHours, // Use calculated default
        remainingHours: requiredMonthlyHours, // Default to full required hours
      },
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user, // Pass database user
      messages: { error: "Wystąpił błąd podczas ładowania danych" },
    });
  }
});

// Add holiday
router.post("/", async (req, res) => {
  try {
    // Get authenticated user ID
    const userId = req.user.id;
    const { start_date, end_date } = req.body;

    // Validate the start date (cannot be empty)
    if (!start_date) {
      return res.redirect("/holidays?error=invalid_date");
    }

    // Check if the start date is a weekend
    const startDayObj = new Date(start_date);
    const startDayOfWeek = startDayObj.getDay();
    if (startDayOfWeek === 0 || startDayOfWeek === 6) {
      return res.redirect("/holidays?error=weekend_not_allowed");
    }

    // If end_date is not provided, use start_date as the end date (single day)
    const actualEndDate = end_date || start_date;

    // Generate all dates in the range (weekends are automatically excluded)
    const holidayDates = generateDateRange(start_date, actualEndDate);

    // Check if any dates were generated (might be empty if only weekend days)
    if (holidayDates.length === 0) {
      return res.redirect("/holidays?error=weekend_only");
    }

    // Create holiday entries for each date in the range
    for (const holiday_date of holidayDates) {
      await Holiday.create({
        user_id: userId,
        holiday_date,
      });
    }

    const daysCount = holidayDates.length;
    let successMessage = daysCount > 1 ? `added_${daysCount}_days` : "added";

    // Check if date range includes weekends to inform the user
    const startObj = new Date(start_date);
    const endObj = new Date(actualEndDate);
    const dayCount =
      Math.round((endObj - startObj) / (1000 * 60 * 60 * 24)) + 1;

    if (dayCount > daysCount) {
      successMessage += "_weekends_excluded";
    }

    res.redirect(`/holidays?success=${successMessage}`);
  } catch (error) {
    console.error("Error adding holiday:", error);
    res.redirect("/holidays?error=failed");
  }
});

// Delete holiday
router.post("/:id/delete", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id; // Get authenticated user ID

    // Get the holiday entry
    const holidayEntry = await Holiday.findById(id);

    // Ensure user owns the entry and it exists
    if (!holidayEntry || holidayEntry.user_id !== userId) {
      return res.redirect("/holidays?error=not_found");
    }

    // Delete the entry
    await holidayEntry.delete();

    res.redirect("/holidays?success=deleted");
  } catch (error) {
    console.error("Error deleting holiday:", error);
    res.redirect("/holidays?error=failed");
  }
});

// Display holiday history for the user
router.get("/history", async (req, res) => {
  try {
    // Get authenticated user ID
    const userId = req.user.id;
    const today = formatDate(new Date()); // Format as YYYY-MM-DD

    // Get past holidays
    const pastHolidays = await Holiday.findPastHolidays(userId, today);

    // Group holidays by month
    const holidaysByMonth = {};
    pastHolidays.forEach((holiday) => {
      // Format the holiday date for display before grouping
      holiday.holiday_date = formatDateForDisplay(holiday.holiday_date);

      // Extract year and month from the holiday date
      const formattedDate = formatDate(holiday.holiday_date); // Use formatDate for reliable splitting
      const dateParts = formattedDate.split("-");
      const year = dateParts[0];
      const month = dateParts[1];
      const monthKey = `${year}-${month}`;

      // Create month group if it doesn't exist
      if (!holidaysByMonth[monthKey]) {
        // Get month name in Polish
        const date = new Date(year, parseInt(month) - 1, 1);
        const monthName = date.toLocaleString("pl-PL", { month: "long" });
        holidaysByMonth[monthKey] = {
          name: `${monthName} ${year}`,
          holidays: [],
        };
      }

      // Add holiday to the month group
      holidaysByMonth[monthKey].holidays.push(holiday);
    });

    res.render("holidays/history", {
      title: "Historia urlopów",
      currentPage: "holidays",
      holidaysByMonth,
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user, // Pass database user
      messages: prepareMessages(req.query),
    });
  } catch (error) {
    console.error("Error loading holiday history:", error);
    res.render("holidays/history", {
      title: "Historia urlopów",
      currentPage: "holidays",
      holidaysByMonth: {},
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user,
      messages: { error: "Wystąpił błąd podczas ładowania historii urlopów" },
    });
  }
});

// Display future holidays for the user
router.get("/future", async (req, res) => {
  try {
    // Get authenticated user ID
    const userId = req.user.id;
    const today = formatDate(new Date()); // Format as YYYY-MM-DD using our utility

    // Get future holidays
    const futureHolidays = await Holiday.findFutureHolidays(userId, today);

    // Format holiday dates for display
    futureHolidays.forEach((holiday) => {
      holiday.holiday_date = formatDateForDisplay(holiday.holiday_date);
    });

    res.render("holidays/future", {
      title: "Planowane urlopy",
      currentPage: "holidays",
      futureHolidays,
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user, // Pass database user
      messages: prepareMessages(req.query),
    });
  } catch (error) {
    console.error("Error loading future holidays:", error);
    res.render("holidays/future", {
      title: "Planowane urlopy",
      currentPage: "holidays",
      futureHolidays: [],
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user, // Pass database user
      messages: { error: "Wystąpił błąd podczas ładowania danych" },
    });
  }
});

module.exports = router;
