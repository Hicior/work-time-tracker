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
  getMonthDateRange,
} = require("../utils/dateUtils"); // Import the helper functions
const { prepareMessages } = require("../utils/messageUtils"); // Import message utility
const User = require("../models/User");

// Helper function to get dates for the last 3 working days including weekend days in between
const getValidDates = async () => {
  const today = new Date();
  const validDates = [];
  let currentDate = new Date(today);
  let workingDaysCount = 0;

  // Get public holidays for a broader date range (up to 3 months back to be safe)
  const threeMonthsBack = new Date(today);
  threeMonthsBack.setMonth(today.getMonth() - 3);
  
  // Get all public holidays that might affect our date range
  const publicHolidaysData = [];
  for (let monthOffset = 0; monthOffset <= 3; monthOffset++) {
    const checkDate = new Date(today);
    checkDate.setMonth(today.getMonth() - monthOffset);
    const monthHolidays = await PublicHoliday.findByMonthAndYear(
      checkDate.getMonth() + 1,
      checkDate.getFullYear()
    );
    publicHolidaysData.push(...monthHolidays);
  }

  // Create a set of public holiday dates for quick lookup
  const publicHolidayDates = new Set(
    publicHolidaysData.map(holiday => formatDate(holiday.holiday_date))
  );

  // Check if today is a working day
  const todayFormatted = formatDate(currentDate);
  const isTodayWeekend = [0, 6].includes(currentDate.getDay());
  const isTodayPublicHoliday = publicHolidayDates.has(todayFormatted);

  // Add today regardless of whether it's a working day
  validDates.push({
    date: new Date(currentDate),
    label: "Dzisiaj",
    formattedDate: todayFormatted,
    isWeekend: isTodayWeekend,
    isPublicHoliday: isTodayPublicHoliday,
  });

  // Count today if it's a working day (not weekend and not public holiday)
  if (!isTodayWeekend && !isTodayPublicHoliday) {
    workingDaysCount++;
  }

  // Find dates up to the last 3 working days + weekends/holidays in between
  let daysBack = 0;
  while (workingDaysCount < 3 && daysBack < 30) {
    // Increased safety limit to 30 days back
    daysBack++;

    // Move to previous day
    const previousDate = new Date(currentDate);
    previousDate.setDate(currentDate.getDate() - daysBack);

    const dayOfWeek = previousDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
    const previousDateFormatted = formatDate(previousDate);
    const isPublicHoliday = publicHolidayDates.has(previousDateFormatted);

    // Create label based on position
    let label;
    if (daysBack === 1) {
      label = "Wczoraj";
    } else {
      label = getDayOfWeekName(previousDateFormatted);
    }

    // Add the date to our valid dates
    validDates.push({
      date: new Date(previousDate),
      label: label,
      formattedDate: previousDateFormatted,
      isWeekend: isWeekend,
      isPublicHoliday: isPublicHoliday,
    });

    // Count working days (not weekend and not public holiday)
    if (!isWeekend && !isPublicHoliday) {
      workingDaysCount++;
    }
  }

  // Sort dates in descending order (most recent first)
  validDates.sort((a, b) => b.date - a.date);

  const oldToday = new Date(today);
  const yesterday = new Date(oldToday);
  yesterday.setDate(oldToday.getDate() - 1);
  const dayBeforeYesterday = new Date(oldToday);
  dayBeforeYesterday.setDate(oldToday.getDate() - 2);

  return {
    dates: validDates,
    today: formatDate(today),
    yesterday: formatDate(yesterday),
    dayBeforeYesterday: formatDate(dayBeforeYesterday),
  };
};

// Display work hours page
router.get("/", async (req, res) => {
  try {
    // Get authenticated user ID
    const userId = req.user.id;
    const validDates = await getValidDates(); // Get valid working dates
    const { dates, today } = validDates;

    // Get work hours for valid dates
    let workHours = [];
    for (const dateInfo of dates) {
      const entries = await WorkHours.findByUserAndDate(
        userId,
        dateInfo.formattedDate
      );
      workHours = [...workHours, ...entries];
    }

    // Sort by date (descending)
    workHours.sort((a, b) => new Date(b.work_date) - new Date(a.work_date));

    // Add weekday names to each entry and format dates
    workHours.forEach((entry) => {
      entry.weekday_name = getDayOfWeekName(entry.work_date);
      entry.work_date = formatDateForDisplay(entry.work_date);
    });

    // Check if today is a holiday (still relevant for displaying message)
    const isHolidayToday = await Holiday.isHoliday(userId, today);

    // Get month and year from query parameters or use current month
    const queryMonth = parseInt(req.query.month) || new Date().getMonth() + 1;
    const queryYear = parseInt(req.query.year) || new Date().getFullYear();
    
    // Validate month and year
    const currentMonth = Math.max(1, Math.min(12, queryMonth));
    const currentYear = Math.max(2020, Math.min(2030, queryYear)); // Reasonable year range

    // Get public holidays for the selected month
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

    // Get all work hours for the selected month (for calendar view)
    const { startDate, endDate } = getMonthDateRange(currentYear, currentMonth);
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    
    const monthlyWorkHours = await WorkHours.findByUserAndDateRange(
      userId,
      startDate,
      endDate
    );

    // Get holidays for the selected month
    const monthlyHolidays = await Holiday.findByUserAndDateRange(
      userId,
      startDate,
      endDate
    );

    // Create calendar data for the current month
    const calendarData = [];
    const workHoursMap = {};
    const holidaysMap = {};
    const publicHolidaysMap = {};

    // Create maps for easy lookup
    monthlyWorkHours.forEach((entry) => {
      const dateKey = formatDate(entry.work_date);
      workHoursMap[dateKey] = entry.total_hours;
    });

    monthlyHolidays.forEach((holiday) => {
      const dateKey = formatDate(holiday.holiday_date);
      holidaysMap[dateKey] = true;
    });

    publicHolidays.forEach((holiday) => {
      const dateKey = formatDate(holiday.holiday_date);
      publicHolidaysMap[dateKey] = true;
    });

    // Generate calendar data for each day of the month
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0); // Reset time to compare dates only
    const formattedMonth = currentMonth.toString().padStart(2, "0");
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = day.toString().padStart(2, "0");
      const dateStr = `${currentYear}-${formattedMonth}-${dayStr}`;
      const date = new Date(currentYear, currentMonth - 1, day);
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
      
      const hasWorkHours = workHoursMap[dateStr] > 0;
      const isHoliday = holidaysMap[dateStr] || false;
      const isPublicHoliday = publicHolidaysMap[dateStr] || false;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isWorkday = !isWeekend && !isHoliday && !isPublicHoliday;
      const isPastDate = date < todayDate;
      const needsAttention = isWorkday && !hasWorkHours && isPastDate;

      calendarData.push({
        day,
        date: dateStr,
        dayOfWeek,
        hasWorkHours,
        isHoliday,
        isPublicHoliday,
        isWeekend,
        isWorkday,
        isPastDate,
        needsAttention
      });
    }

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
    // Subtract all public holidays from required monthly hours
    const requiredMonthlyHours =
      (workDaysInMonth - publicHolidays.length) * hoursPerDay;

    const totalHolidayHours = holidayCount * hoursPerDay;
    const publicHolidayHours = publicHolidaysOnWorkdays.length * hoursPerDay;
    // Don't include public holidays in total combined hours
    const totalCombinedHours = totalWorkHours + totalHolidayHours;

    const remainingHours = Math.max(
      0,
      requiredMonthlyHours - totalCombinedHours
    );

    res.render("work-hours/index", {
      title: "Czas pracy",
      currentPage: "work-hours",
      workHours, // Pass combined and sorted work hours
      validDates: dates, // Pass valid workdays
      todayDate: today,
      yesterdayDate: validDates.yesterday,
      dayBeforeYesterdayDate: validDates.dayBeforeYesterday,
      isHolidayToday,
      publicHolidays, // Pass full public holidays list to the view
      publicHolidaysOnWorkdays, // Pass weekday public holidays array
      calendarData, // Pass calendar data for monthly view
      currentMonth,
      currentYear,
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
    const validDates = await getValidDates();
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const workDaysInMonth = getWeekdaysInMonth(currentYear, currentMonth);
    const requiredMonthlyHours = workDaysInMonth * 8;

    res.render("work-hours/index", {
      title: "Czas pracy",
      currentPage: "work-hours",
      workHours: [],
      validDates: validDates.dates, // Pass valid workdays even in error case
      todayDate: validDates.today,
      yesterdayDate: validDates.yesterday,
      dayBeforeYesterdayDate: validDates.dayBeforeYesterday,
      isHolidayToday: false,
      publicHolidays: [], // Empty array in error case
      publicHolidaysOnWorkdays: [], // Empty array in error case
      calendarData: [], // Empty calendar data in error case
      currentMonth: Math.max(1, Math.min(12, parseInt(req.query.month) || new Date().getMonth() + 1)),
      currentYear: Math.max(2020, Math.min(2030, parseInt(req.query.year) || new Date().getFullYear())),
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
    const validDates = await getValidDates(); // Get valid dates

    // Extract valid formatted dates for validation
    const validFormattedDates = validDates.dates.map((d) => d.formattedDate);

    // --- Validation ---
    // 1. Check if date is valid (one of the last 3 working days)
    if (!validFormattedDates.includes(work_date)) {
      return res.redirect("/work-hours?error=invalid_date");
    }

    // 2. Validate and convert total_hours
    const total_hours = parseFloat(total_hours_str);
    if (isNaN(total_hours) || total_hours <= 0) {
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
    const validDates = await getValidDates(); // Get valid dates

    // Extract valid formatted dates for validation
    const validFormattedDates = validDates.dates.map((d) => d.formattedDate);

    // Get the work hours entry
    const workHoursEntry = await WorkHours.findById(id);
    if (!workHoursEntry || workHoursEntry.user_id !== userId) {
      // Ensure user owns the entry
      return res.redirect("/work-hours?error=not_found");
    }

    // --- Validation ---
    // 1. Check if the entry's date is within the allowed range (last 3 working days)
    if (!validFormattedDates.includes(workHoursEntry.work_date)) {
      return res.redirect("/work-hours?error=cannot_update_old");
    }

    // 2. Validate and convert total_hours
    const total_hours = parseFloat(total_hours_str);
    if (isNaN(total_hours) || total_hours <= 0) {
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
    const validDates = await getValidDates(); // Get valid dates

    // Extract valid formatted dates for validation
    const validFormattedDates = validDates.dates.map((d) => d.formattedDate);

    // Get the work hours entry
    const workHoursEntry = await WorkHours.findById(id);
    if (!workHoursEntry || workHoursEntry.user_id !== userId) {
      // Ensure user owns the entry
      return res.redirect("/work-hours?error=not_found");
    }

    // Prevent deleting older entries via manually crafting requests.
    if (!validFormattedDates.includes(workHoursEntry.work_date)) {
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

// Statistics panel for admin and managers
router.get("/statistics", async (req, res) => {
  try {
    // Only allow admin and manager access
    if (!req.user.hasElevatedPermissions()) {
      return res.redirect("/work-hours?error=unauthorized");
    }

    // Get all users for filtering
    const users = await User.getAll();

    // Get filter parameters
    const selectedUserId = req.query.user_id || req.user.id; // Default to logged-in user

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
    let calendarData = []; // New array for calendar data including days from adjacent months
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

      // Prepare daily work hours data for the current month
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
          month: selectedMonth,
          year: selectedYear,
          hours: entry ? entry.total_hours : 0,
          isHoliday,
          isPublicHoliday,
          isCurrentMonth: true,
        };
      });

      // Calculate the first day of the month (0-6, where 0 is Sunday)
      const firstDayOfMonth = new Date(
        selectedYear,
        selectedMonth - 1,
        1
      ).getDay();

      // Convert to Monday-based index (0-6, where 0 is Monday)
      const firstDayMondayBased = (firstDayOfMonth + 6) % 7;

      // Calculate days needed from previous month to complete the first week
      const daysFromPrevMonth = firstDayMondayBased;

      // Calculate the previous month and year
      const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
      const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
      const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();

      // Add days from previous month
      const formattedPrevMonth = prevMonth.toString().padStart(2, "0");
      for (let i = 0; i < daysFromPrevMonth; i++) {
        const day = daysInPrevMonth - daysFromPrevMonth + i + 1;
        const dateStr = `${prevYear}-${formattedPrevMonth}-${day
          .toString()
          .padStart(2, "0")}`;

        calendarData.push({
          day,
          date: dateStr,
          month: prevMonth,
          year: prevYear,
          hours: 0, // We're not loading work hours for adjacent months
          isHoliday: false,
          isPublicHoliday: false,
          isCurrentMonth: false,
        });
      }

      // Add current month days
      calendarData = [...calendarData, ...workData];

      // Calculate days needed from next month to complete the last week
      const totalDaysDisplayed = calendarData.length;
      const daysFromNextMonth = (7 - (totalDaysDisplayed % 7)) % 7;

      // Calculate the next month and year
      const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
      const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;

      // Add days from next month
      const formattedNextMonth = nextMonth.toString().padStart(2, "0");
      for (let i = 0; i < daysFromNextMonth; i++) {
        const day = i + 1;
        const dateStr = `${nextYear}-${formattedNextMonth}-${day
          .toString()
          .padStart(2, "0")}`;

        calendarData.push({
          day,
          date: dateStr,
          month: nextMonth,
          year: nextYear,
          hours: 0, // We're not loading work hours for adjacent months
          isHoliday: false,
          isPublicHoliday: false,
          isCurrentMonth: false,
        });
      }

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
        totalWorkHours + weekdayHolidaysCount * standardWorkHours;

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
        calendarData, // Pass the new calendar data to the view
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
        calendarData: [], // Pass empty calendar data
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

// API endpoint to update work hours from statistics page
router.post("/statistics/update", async (req, res) => {
  try {
    // Only allow admin and manager access
    if (!req.user.hasElevatedPermissions()) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const { user_id, work_date, total_hours } = req.body;

    // Validate input
    if (!user_id || !work_date) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    if (typeof total_hours !== "number" && total_hours !== 0) {
      return res.status(400).json({ error: "Invalid hours value" });
    }

    // Check if the user exists
    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get existing work hours for this date and user
    const existingEntries = await WorkHours.findByUserAndDate(
      user_id,
      work_date
    );

    if (total_hours === 0) {
      // Delete work hours entry if it exists
      if (existingEntries && existingEntries.length > 0) {
        await existingEntries[0].delete();
        return res.json({ success: true, message: "Work hours deleted" });
      } else {
        // Nothing to delete
        return res.json({ success: true, message: "No work hours to delete" });
      }
    } else {
      // Create or update work hours entry
      const result = await WorkHours.createOrUpdate({
        user_id,
        work_date,
        total_hours,
      });

      return res.json({
        success: true,
        message:
          existingEntries.length > 0
            ? "Work hours updated"
            : "Work hours created",
        data: {
          id: result.id,
          total_hours: result.total_hours,
        },
      });
    }
  } catch (error) {
    console.error("Error updating work hours from statistics:", error);
    return res.status(500).json({ error: "Failed to update work hours" });
  }
});

module.exports = router;
