/**
 * Routes for work hours management in the Work Time Tracker application.
 * Handles all work time tracking functionality including adding, editing, and deleting work hours.
 * Provides views for displaying work history and statistics.
 * Implements business rules for work hours including validation against holidays.
 */

const express = require("express");
const router = express.Router();
const WorkHours = require("../models/WorkHours");
const Holiday = require("../models/Holiday");
const PublicHoliday = require("../models/PublicHoliday"); // Add PublicHoliday model
const {
  getWeekdaysInMonth,
  getDayOfWeekName,
  getDayOfWeekAbbr,
  formatDateForDisplay, // Import the new date formatting function
  formatDate,
} = require("../utils/dateUtils"); // Import the helper functions
const { prepareMessages } = require("../utils/messageUtils"); // Import message utility
const User = require("../models/User");

// Helper function to get dates for today, yesterday, and the day before yesterday
const getValidDates = () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dayBeforeYesterday = new Date(today); // Create new date object for day before yesterday
  dayBeforeYesterday.setDate(today.getDate() - 2); // Set date to two days ago

  return {
    today: formatDate(today),
    yesterday: formatDate(yesterday),
    dayBeforeYesterday: formatDate(dayBeforeYesterday), // Return formatted day before yesterday
  };
};

// Display work hours page
router.get("/", async (req, res) => {
  try {
    // Get authenticated user ID
    const userId = req.user.id;
    const { today, yesterday, dayBeforeYesterday } = getValidDates(); // Get all three dates

    // Get work hours for today, yesterday, and day before yesterday
    const workHoursToday = await WorkHours.findByUserAndDate(userId, today);
    const workHoursYesterday = await WorkHours.findByUserAndDate(
      userId,
      yesterday
    );
    const workHoursDayBeforeYesterday = await WorkHours.findByUserAndDate(
      // Fetch day before yesterday's hours
      userId,
      dayBeforeYesterday
    );
    // Combine and display hours from the last three days, sorted by date
    const workHours = [
      ...workHoursDayBeforeYesterday,
      ...workHoursYesterday,
      ...workHoursToday,
    ].sort((a, b) => new Date(b.work_date) - new Date(a.work_date)); // Sort descending

    // Add weekday names to each entry and format dates
    workHours.forEach((entry) => {
      entry.weekday_name = getDayOfWeekName(entry.work_date);
      entry.work_date = formatDateForDisplay(entry.work_date);
    });

    // Check if today is a holiday (still relevant for displaying message)
    const isHolidayToday = await Holiday.isHoliday(userId, today);

    // Get current month's stats for display
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Get public holidays for the current month
    const publicHolidays = await PublicHoliday.findByMonthAndYear(
      currentMonth,
      currentYear
    );

    // Filter public holidays for weekdays
    const publicHolidaysOnWorkdays = publicHolidays.filter((holiday) => {
      const date = new Date(holiday.holiday_date);
      const dayOfWeek = date.getDay();
      return dayOfWeek !== 0 && dayOfWeek !== 6; // 0 = Sunday, 6 = Saturday
    });

    const totalWorkHours = await WorkHours.getTotalMonthlyHours(
      userId,
      currentYear,
      currentMonth
    );
    const holidayCount = await Holiday.getTotalMonthlyHolidays(
      userId,
      currentYear,
      currentMonth
    );

    // Calculate stats
    const hoursPerDay = 8;
    const workDaysInMonth = getWeekdaysInMonth(currentYear, currentMonth);
    const requiredMonthlyHours = workDaysInMonth * hoursPerDay;

    const totalHolidayHours = holidayCount * hoursPerDay;
    const publicHolidayHours = publicHolidaysOnWorkdays.length * hoursPerDay;
    const totalCombinedHours =
      totalWorkHours + totalHolidayHours + publicHolidayHours;

    const remainingHours = Math.max(
      0,
      requiredMonthlyHours - totalCombinedHours
    );

    res.render("work-hours/index", {
      title: "Czas pracy",
      currentPage: "work-hours",
      workHours, // Pass combined and sorted work hours
      todayDate: today,
      yesterdayDate: yesterday,
      dayBeforeYesterdayDate: dayBeforeYesterday, // Pass day before yesterday's date
      isHolidayToday,
      publicHolidays, // Pass full public holidays list to the view
      publicHolidaysOnWorkdays, // Pass weekday public holidays array
      monthStats: {
        totalWorkHours: Math.round(totalWorkHours * 100) / 100,
        holidayCount,
        totalHolidayHours,
        publicHolidaysCount: publicHolidaysOnWorkdays.length, // Count of PH on workdays
        publicHolidayHours,
        totalCombinedHours: Math.round(totalCombinedHours * 100) / 100,
        requiredMonthlyHours, // Pass calculated required hours
        remainingHours: Math.round(remainingHours * 100) / 100,
        publicHolidayCount: publicHolidaysOnWorkdays.length, // Changed to use workday holidays only
      },
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user, // Pass database user
      messages: prepareMessages(req.query), // Process messages
    });
  } catch (error) {
    console.error("Error loading work hours:", error);
    const { today } = getValidDates();
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const workDaysInMonth = getWeekdaysInMonth(currentYear, currentMonth);
    const requiredMonthlyHours = workDaysInMonth * 8;

    res.render("work-hours/index", {
      title: "Czas pracy",
      currentPage: "work-hours",
      workHours: [],
      todayDate: today,
      yesterdayDate: getValidDates().yesterday,
      dayBeforeYesterdayDate: getValidDates().dayBeforeYesterday, // Add in error case too
      isHolidayToday: false,
      publicHolidays: [], // Empty array in error case
      publicHolidaysOnWorkdays: [], // Empty array in error case
      monthStats: {
        totalWorkHours: 0,
        holidayCount: 0,
        totalHolidayHours: 0,
        publicHolidaysCount: 0,
        publicHolidayHours: 0,
        totalCombinedHours: 0,
        requiredMonthlyHours, // Use calculated default
        remainingHours: requiredMonthlyHours, // Default to full required hours
        publicHolidayCount: 0, // Default to 0
      },
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user, // Pass database user
      messages: { error: "Wystąpił błąd podczas ładowania danych" },
    });
  }
});

// Add work hours entry
router.post("/", async (req, res) => {
  try {
    // Get authenticated user ID
    const userId = req.user.id;
    const { work_date, total_hours_str } = req.body; // Get total_hours as string
    const { today, yesterday, dayBeforeYesterday } = getValidDates(); // Get all valid dates

    // --- Validation ---
    // 1. Check if date is valid (today, yesterday, or day before yesterday)
    if (
      work_date !== today &&
      work_date !== yesterday &&
      work_date !== dayBeforeYesterday // Allow day before yesterday
    ) {
      console.warn(`Invalid date attempt: ${work_date} by user ${userId}`);
      return res.redirect("/work-hours?error=invalid_date");
    }

    // 2. Validate and convert total_hours
    const total_hours = parseFloat(total_hours_str);
    if (isNaN(total_hours) || total_hours <= 0) {
      console.warn(
        `Invalid hours attempt: ${total_hours_str} by user ${userId}`
      );
      return res.redirect("/work-hours?error=invalid_hours");
    }
    // --- End Validation ---

    // Create or update work hours entry
    const existingEntries = await WorkHours.findByUserAndDate(
      userId,
      work_date
    );
    const isUpdate = existingEntries && existingEntries.length > 0;

    await WorkHours.createOrUpdate({
      user_id: userId,
      work_date,
      total_hours, // Use the validated number
    });

    res.redirect(`/work-hours?success=${isUpdate ? "updated" : "added"}`);
  } catch (error) {
    console.error("Error adding work hours:", error);
    // Check for specific model validation errors
    if (error.message === "Invalid total hours value.") {
      return res.redirect("/work-hours?error=invalid_hours");
    }
    res.redirect("/work-hours?error=failed");
  }
});

// Update work hours entry
router.post("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { total_hours_str } = req.body; // Get total_hours as string for update
    const userId = req.user.id; // Get authenticated user ID
    const { today, yesterday, dayBeforeYesterday } = getValidDates(); // Get all valid dates

    // Get the work hours entry
    const workHoursEntry = await WorkHours.findById(id);
    if (!workHoursEntry || workHoursEntry.user_id !== userId) {
      // Ensure user owns the entry
      return res.redirect("/work-hours?error=not_found");
    }

    // --- Validation ---
    // 1. Check if the entry's date is within the allowed range (today, yesterday, day before yesterday)
    //    This prevents updating older entries via manually crafting requests.
    if (
      workHoursEntry.work_date !== today &&
      workHoursEntry.work_date !== yesterday &&
      workHoursEntry.work_date !== dayBeforeYesterday // Allow day before yesterday
    ) {
      console.warn(
        `Update attempt on old entry (${workHoursEntry.work_date}) ID: ${id} by user ${userId}`
      );
      return res.redirect("/work-hours?error=cannot_update_old");
    }

    // 2. Validate and convert total_hours
    const total_hours = parseFloat(total_hours_str);
    if (isNaN(total_hours) || total_hours <= 0) {
      console.warn(
        `Invalid hours update attempt: ${total_hours_str} for ID: ${id} by user ${userId}`
      );
      return res.redirect("/work-hours?error=invalid_hours");
    }
    // --- End Validation ---

    // Update the entry
    await workHoursEntry.update({
      total_hours, // Use the validated number
    });

    res.redirect("/work-hours?success=updated");
  } catch (error) {
    console.error("Error updating work hours:", error);
    // Check for specific model validation errors
    if (error.message === "Invalid total hours value.") {
      return res.redirect("/work-hours?error=invalid_hours");
    }
    res.redirect("/work-hours?error=failed");
  }
});

// Delete work hours entry
router.post("/:id/delete", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id; // Get authenticated user ID
    const { today, yesterday, dayBeforeYesterday } = getValidDates(); // Get all valid dates

    // Get the work hours entry
    const workHoursEntry = await WorkHours.findById(id);
    if (!workHoursEntry || workHoursEntry.user_id !== userId) {
      // Ensure user owns the entry
      return res.redirect("/work-hours?error=not_found");
    }

    // Prevent deleting older entries via manually crafting requests.
    if (
      workHoursEntry.work_date !== today &&
      workHoursEntry.work_date !== yesterday &&
      workHoursEntry.work_date !== dayBeforeYesterday // Allow day before yesterday
    ) {
      console.warn(
        `Delete attempt on old entry (${workHoursEntry.work_date}) ID: ${id} by user ${userId}`
      );
      return res.redirect("/work-hours?error=cannot_delete_old");
    }

    // Delete the entry
    await workHoursEntry.delete();

    res.redirect("/work-hours?success=deleted");
  } catch (error) {
    console.error("Error deleting work hours:", error);
    res.redirect("/work-hours?error=failed");
  }
});

// Statistics panel for admin
router.get("/statistics", async (req, res) => {
  try {
    // Only allow admin access
    if (!req.user.isAdmin()) {
      return res.redirect("/work-hours?error=unauthorized");
    }

    // Get all users for filtering
    const users = await User.getAll();

    // Get filter parameters
    const selectedUserId =
      req.query.user_id || (users.length > 0 ? users[0].id : null);

    // Parse month and year from query or use current month
    let selectedMonth = parseInt(req.query.month);
    let selectedYear = parseInt(req.query.year);

    const currentDate = new Date();
    if (isNaN(selectedMonth) || selectedMonth < 1 || selectedMonth > 12) {
      selectedMonth = currentDate.getMonth() + 1;
    }
    if (isNaN(selectedYear) || selectedYear < 2000 || selectedYear > 2100) {
      selectedYear = currentDate.getFullYear();
    }

    // Get days in the selected month
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

    let workData = [];
    let totalCombinedHours = 0;

    if (selectedUserId) {
      // Format month to ensure it's 2 digits
      const formattedMonth = selectedMonth.toString().padStart(2, "0");
      const startDate = `${selectedYear}-${formattedMonth}-01`;
      const endDate = `${selectedYear}-${formattedMonth}-${daysInMonth}`;

      // Get work hours for the selected user and month
      const workHours = await WorkHours.findByUserAndDateRange(
        selectedUserId,
        startDate,
        endDate
      );

      // Format work_date in each entry to ensure consistent format
      workHours.forEach((entry) => {
        entry.work_date = formatDate(entry.work_date);
      });

      // Get holidays for the selected user and month
      const holidays = await Holiday.findByUserAndDateRange(
        selectedUserId,
        startDate,
        endDate
      );

      // Format holiday_date in each entry
      holidays.forEach((holiday) => {
        holiday.holiday_date = formatDate(holiday.holiday_date);
      });

      // Get public holidays for the selected month
      const publicHolidays = await PublicHoliday.findByMonthAndYear(
        selectedMonth,
        selectedYear
      );

      // Format public holiday dates
      publicHolidays.forEach((holiday) => {
        holiday.holiday_date = formatDate(holiday.holiday_date);
      });

      // Create arrays of formatted dates for easier checking
      const holidayDates = holidays.map((h) => h.holiday_date);
      const publicHolidayDates = publicHolidays.map((ph) => ph.holiday_date);

      // Standard workday hours
      const standardWorkHours = 8;

      // Prepare daily work hours data
      workData = Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const dateStr = `${selectedYear}-${formattedMonth}-${day
          .toString()
          .padStart(2, "0")}`;

        // Find matching work hours entry
        const entry = workHours.find((h) => h.work_date === dateStr);

        // Check if this day is a holiday
        const isHoliday = holidayDates.includes(dateStr);

        // Check if this day is a public holiday
        const isPublicHoliday = publicHolidayDates.includes(dateStr);

        return {
          day,
          date: dateStr,
          hours: entry ? entry.total_hours : 0,
          isHoliday,
          isPublicHoliday,
        };
      });

      // Calculate total combined hours exactly like dashboard does
      // First, calculate total work hours
      const totalWorkHours = workData.reduce(
        (total, day) => total + day.hours,
        0
      );

      // Then count weekday holidays
      let weekdayHolidaysCount = 0;
      let weekdayPublicHolidaysCount = 0;

      workData.forEach((day) => {
        // Use formatDate to ensure date format is consistent
        const date = new Date(formatDate(day.date));
        const dayOfWeek = date.getDay();
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

        if (isWeekday) {
          if (day.isHoliday) {
            weekdayHolidaysCount += 1;
          }
          // Only count public holidays if not already counted as regular holiday
          else if (day.isPublicHoliday) {
            weekdayPublicHolidaysCount += 1;
          }
        }
      });

      // Calculate combined total exactly as dashboard does
      totalCombinedHours =
        totalWorkHours +
        weekdayHolidaysCount * standardWorkHours +
        weekdayPublicHolidaysCount * standardWorkHours;

      // Get the selected user's details
      const selectedUser = users.find((u) => u.id === parseInt(selectedUserId));

      res.render("admin/statistics", {
        title: "Panel Statystyk",
        currentPage: "admin-statistics",
        users,
        selectedUserId: parseInt(selectedUserId),
        selectedMonth,
        selectedYear,
        months: [
          { value: 1, name: "Styczeń" },
          { value: 2, name: "Luty" },
          { value: 3, name: "Marzec" },
          { value: 4, name: "Kwiecień" },
          { value: 5, name: "Maj" },
          { value: 6, name: "Czerwiec" },
          { value: 7, name: "Lipiec" },
          { value: 8, name: "Sierpień" },
          { value: 9, name: "Wrzesień" },
          { value: 10, name: "Październik" },
          { value: 11, name: "Listopad" },
          { value: 12, name: "Grudzień" },
        ],
        workData,
        selectedUser,
        getDayOfWeekAbbr, // Pass the function to the view
        isAuthenticated: req.oidc.isAuthenticated(),
        user: req.oidc.user,
        dbUser: req.user,
        totalCombinedHours: Math.round(totalCombinedHours * 100) / 100, // Round to 2 decimal places
      });
    } else {
      // No users or no user selected
      res.render("admin/statistics", {
        title: "Panel Statystyk",
        currentPage: "admin-statistics",
        users: [],
        selectedUserId: null,
        selectedMonth,
        selectedYear,
        months: [
          { value: 1, name: "Styczeń" },
          { value: 2, name: "Luty" },
          { value: 3, name: "Marzec" },
          { value: 4, name: "Kwiecień" },
          { value: 5, name: "Maj" },
          { value: 6, name: "Czerwiec" },
          { value: 7, name: "Lipiec" },
          { value: 8, name: "Sierpień" },
          { value: 9, name: "Wrzesień" },
          { value: 10, name: "Październik" },
          { value: 11, name: "Listopad" },
          { value: 12, name: "Grudzień" },
        ],
        workData: [],
        getDayOfWeekAbbr, // Pass the function to the view
        isAuthenticated: req.oidc.isAuthenticated(),
        user: req.oidc.user,
        dbUser: req.user,
        totalCombinedHours: 0,
      });
    }
  } catch (error) {
    console.error("Error loading statistics:", error);
    res.redirect("/admin?error=failed");
  }
});

module.exports = router;
