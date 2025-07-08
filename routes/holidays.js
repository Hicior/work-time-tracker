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
const User = require("../models/User");
const Group = require("../models/Group");
const {
  getWeekdaysInMonth,
  formatDate,
  formatDateForDisplay,
  getDayOfWeekName,
  formatDayAndMonthGenitive,
  getMonthDateRange,
} = require("../utils/dateUtils");
const { prepareMessages } = require("../utils/messageUtils");

// Helper function to generate dates between start and end date (inclusive)
const generateDateRange = (startDate, endDate, publicHolidays = []) => {
  const dates = [];
  const currentDate = new Date(startDate);
  const lastDate = new Date(endDate);

  // Create a Set of public holiday dates for faster lookup
  const publicHolidayDates = new Set(
    publicHolidays.map(ph => formatDate(ph.holiday_date))
  );

  // Add dates until we reach the end date
  while (currentDate <= lastDate) {
    const dayOfWeek = currentDate.getDay();
    const currentDateStr = formatDate(new Date(currentDate));
    
    // Skip weekends (0 = Sunday, 6 = Saturday) and public holidays
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !publicHolidayDates.has(currentDateStr)) {
      dates.push(currentDateStr);
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
  const { startDate, endDate } = getMonthDateRange(year, month);

  return {
    year,
    month,
    firstDay: startDate,
    lastDay: endDate,
    formattedMonth,
  };
};

// Display holidays page
router.get("/", async (req, res) => {
  try {
    // Get authenticated user ID
    const userId = req.user.id;
    
    // Get month and year from query parameters or use current month
    const queryMonth = parseInt(req.query.month) || new Date().getMonth() + 1;
    const queryYear = parseInt(req.query.year) || new Date().getFullYear();
    
    // Validate month and year
    const month = Math.max(1, Math.min(12, queryMonth));
    const year = Math.max(2020, Math.min(2030, queryYear)); // Reasonable year range
    
    // Get date range for the specified month
    const { startDate, endDate } = getMonthDateRange(year, month);
    const firstDay = startDate;
    const lastDay = endDate;

    // Get holidays for the selected month
    const holidays = await Holiday.findByUserAndDateRange(
      userId,
      firstDay,
      lastDay
    );

    // Format holiday dates for display
    holidays.forEach((holiday) => {
      holiday.holiday_date = formatDateForDisplay(holiday.holiday_date);
    });

    // Get public holidays for the selected month
    const rawPublicHolidays = await PublicHoliday.findByMonthAndYear(
      month,
      year
    );

    // Get public holidays for broader date range (for client-side validation)
    const currentYear = new Date().getFullYear();
    const publicHolidaysCurrentYear = await PublicHoliday.findByYear(currentYear);
    const publicHolidaysNextYear = await PublicHoliday.findByYear(currentYear + 1);
    const allPublicHolidays = [...publicHolidaysCurrentYear, ...publicHolidaysNextYear];

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
      publicHolidaysRaw: allPublicHolidays, // Pass broader range of public holidays for client-side validation
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
    // Get month and year from query parameters or use current month for error case
    const month = Math.max(1, Math.min(12, parseInt(req.query.month) || new Date().getMonth() + 1));
    const year = Math.max(2020, Math.min(2030, parseInt(req.query.year) || new Date().getFullYear()));
    const workDaysInMonth = getWeekdaysInMonth(year, month);
    const requiredMonthlyHours = workDaysInMonth * 8;

    res.render("holidays/index", {
      title: "Urlopy",
      currentPage: "holidays",
      holidays: [],
      publicHolidays: [],
      publicHolidaysRaw: [], // Pass empty array for broader public holidays in error case
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

    // Get public holidays for the date range
    const publicHolidays = await PublicHoliday.findByDateRange(start_date, actualEndDate);

    // Check if start date is a public holiday
    const startDateFormatted = formatDate(start_date);
    const isStartDatePublicHoliday = publicHolidays.some(
      ph => formatDate(ph.holiday_date) === startDateFormatted
    );
    if (isStartDatePublicHoliday) {
      return res.redirect("/holidays?error=public_holiday_not_allowed");
    }

    // Generate all dates in the range (weekends and public holidays are automatically excluded)
    const holidayDates = generateDateRange(start_date, actualEndDate, publicHolidays);

    // Check if any dates were generated (might be empty if only weekend days or public holidays)
    if (holidayDates.length === 0) {
      return res.redirect("/holidays?error=no_valid_days");
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

    // Check if date range includes weekends or public holidays to inform the user
    const startObj = new Date(start_date);
    const endObj = new Date(actualEndDate);
    const totalDayCount =
      Math.round((endObj - startObj) / (1000 * 60 * 60 * 24)) + 1;

    if (totalDayCount > daysCount) {
      const excludedDays = totalDayCount - daysCount;
      const weekendsAndPublicHolidays = [];
      
      // Check for weekends and public holidays in the excluded days
      let hasWeekends = false;
      let hasPublicHolidays = false;
      
      for (let i = 0; i < totalDayCount; i++) {
        const checkDate = new Date(startObj);
        checkDate.setDate(startObj.getDate() + i);
        const dayOfWeek = checkDate.getDay();
        const checkDateStr = formatDate(checkDate);
        
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          hasWeekends = true;
        }
        if (publicHolidays.some(ph => formatDate(ph.holiday_date) === checkDateStr)) {
          hasPublicHolidays = true;
        }
      }
      
      if (hasWeekends && hasPublicHolidays) {
        successMessage += "_weekends_and_holidays_excluded";
      } else if (hasWeekends) {
        successMessage += "_weekends_excluded";
      } else if (hasPublicHolidays) {
        successMessage += "_holidays_excluded";
      }
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
      // Check if user is admin, if so, allow deletion
      if (!req.user.isAdmin()) {
        return res.redirect("/holidays?error=not_found");
      }
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

    // Get public holidays for the next 2 years (for future date validation)
    const currentYear = new Date().getFullYear();
    const publicHolidaysCurrentYear = await PublicHoliday.findByYear(currentYear);
    const publicHolidaysNextYear = await PublicHoliday.findByYear(currentYear + 1);
    const publicHolidays = [...publicHolidaysCurrentYear, ...publicHolidaysNextYear];

    res.render("holidays/future", {
      title: "Planowane urlopy",
      currentPage: "holidays",
      futureHolidays,
      publicHolidays,
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
      publicHolidays: [],
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user, // Pass database user
      messages: { error: "Wystąpił błąd podczas ładowania danych" },
    });
  }
});

// Redirect /employees to /employees/by-date by default
router.get("/employees", (req, res) => {
  res.redirect("/holidays/employees/by-date");
});

// Display all employee holidays for the current month (grouped by date)
router.get("/employees/by-date", async (req, res) => {
  try {
    // Get month and year from query parameters or use current month
    const queryMonth = parseInt(req.query.month) || new Date().getMonth() + 1;
    const queryYear = parseInt(req.query.year) || new Date().getFullYear();
    
    // Validate month and year
    const month = Math.max(1, Math.min(12, queryMonth));
    const year = Math.max(2020, Math.min(2030, queryYear)); // Reasonable year range
    
    // Get date range for the specified month
    const { startDate, endDate } = getMonthDateRange(year, month);

    // Get all users
    const allUsers = await User.getAll();

    // Initialize an empty object to hold holidays grouped by date
    const holidaysByDate = {};

    // Process each user
    for (const user of allUsers) {
      // Get holidays for this user for the current month
      const userHolidays = await Holiday.findByUserAndDateRange(
        user.id,
        startDate,
        endDate
      );

      // Process each holiday for this user
      for (const holiday of userHolidays) {
        const dateStr = formatDate(holiday.holiday_date);
        // Use the new formatter for the main date display
        const displayDate = formatDayAndMonthGenitive(holiday.holiday_date);
        const dayOfWeek = getDayOfWeekName(holiday.holiday_date);

        // Create entry for this date if it doesn't exist
        if (!holidaysByDate[dateStr]) {
          holidaysByDate[dateStr] = {
            date: displayDate, // Use newly formatted date
            day_of_week: dayOfWeek,
            employees: [],
          };
        }

        // Add this user to the employees for this date
        holidaysByDate[dateStr].employees.push({
          id: user.id,
          name: user.name || user.email.split("@")[0],
          email: user.email,
        });
      }
    }

    res.render("holidays/employees", {
      title: "Urlopy pracowników",
      currentPage: "holidays",
      month,
      year,
      holidaysByDate,
      users: allUsers,
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user,
      messages: prepareMessages(req.query),
      formatDateForDisplay,
      formatDayAndMonthGenitive,
      currentView: "by-date",
    });
  } catch (error) {
    console.error("Error loading employee holidays (by date):", error);
    res.render("holidays/employees", {
      title: "Urlopy pracowników",
      currentPage: "holidays",
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      holidaysByDate: {},
      users: [],
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user,
      messages: { error: "Wystąpił błąd podczas ładowania danych" },
      formatDateForDisplay: () => "",
      formatDayAndMonthGenitive: () => "",
      currentView: "by-date",
    });
  }
});

// Display all employee holidays for the current month (grouped by person)
router.get("/employees/by-person", async (req, res) => {
  try {
    // Get month and year from query parameters or use current month
    const queryMonth = parseInt(req.query.month) || new Date().getMonth() + 1;
    const queryYear = parseInt(req.query.year) || new Date().getFullYear();
    
    // Validate month and year
    const month = Math.max(1, Math.min(12, queryMonth));
    const year = Math.max(2020, Math.min(2030, queryYear)); // Reasonable year range
    
    // Get date range for the specified month
    const { startDate, endDate } = getMonthDateRange(year, month);

    const allUsers = await User.getAll();
    const allGroups = await Group.findAll();
    const publicHolidaysRaw = await PublicHoliday.findByMonthAndYear(
      month,
      year
    );

    const publicHolidaysMap = {};
    publicHolidaysRaw.forEach((ph) => {
      publicHolidaysMap[formatDate(ph.holiday_date)] = ph.name;
    });

    const daysInMonth = [];
    const date = new Date(year, month - 1, 1);
    while (date.getMonth() === month - 1) {
      daysInMonth.push(formatDate(new Date(date)));
      date.setDate(date.getDate() + 1);
    }

    // Create group mapping similar to dashboard
    const groupMap = {};
    
    // Initialize group map with all groups
    allGroups.forEach((group) => {
      groupMap[group.id] = {
        id: group.id,
        name: group.name,
        employees: [],
      };
    });

    // Add "No Group" for users without a group
    groupMap[0] = {
      id: 0,
      name: "Bez grupy",
      employees: [],
    };

    // Process each user and group them
    for (const user of allUsers) {
      const userHolidays = await Holiday.findByUserAndDateRange(
        user.id,
        startDate,
        endDate
      );
      const holidayDates = userHolidays.map((h) => formatDate(h.holiday_date));

      // Filter out users with no holidays in the current month
      if (holidayDates.length > 0) {
        const employeeData = {
          id: user.id,
          name: user.name || user.email.split("@")[0],
          email: user.email,
          holidays: holidayDates,
          holidayCount: holidayDates.length,
        };

        // Add user to the appropriate group
        const groupId = user.group_id || 0; // Use 0 for users without a group
        groupMap[groupId].employees.push(employeeData);
      }
    }

    // Convert groupMap to array and sort groups, filter out empty groups
    const groupedEmployees = Object.values(groupMap)
      .filter((group) => group.employees.length > 0) // Only include groups with employees
      .sort((a, b) => {
        // Sort "No Group" to the end
        if (a.id === 0) return 1;
        if (b.id === 0) return -1;
        // Otherwise sort alphabetically
        return a.name.localeCompare(b.name);
      });

    // Calculate total number of employees with holidays
    let totalEmployeesWithHolidays = 0;
    groupedEmployees.forEach(group => {
      totalEmployeesWithHolidays += group.employees.length;
    });

    res.render("holidays/employees-by-person", {
      title: "Urlopy pracowników - wg osoby",
      currentPage: "holidays",
      month,
      year,
      groupedEmployees,
      daysInMonth,
      publicHolidays: publicHolidaysMap,
      totalEmployeesWithHolidays,
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user,
      messages: prepareMessages(req.query),
      currentView: "by-person",
    });
  } catch (error) {
    console.error("Error loading employee holidays (by person):", error);
    res.render("holidays/employees-by-person", {
      title: "Urlopy pracowników - wg osoby",
      currentPage: "holidays",
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      groupedEmployees: [],
      daysInMonth: [],
      publicHolidays: {},
      totalEmployeesWithHolidays: 0,
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user,
      messages: { error: "Wystąpił błąd podczas ładowania danych" },
      currentView: "by-person",
    });
  }
});

module.exports = router;
