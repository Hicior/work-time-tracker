/**
 * Route handler for employee dashboard in the Work Time Tracker application.
 * Provides routes for viewing all employees' working hours, holidays, and public holidays
 * for a specified month in a consolidated view.
 */
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const WorkHours = require("../models/WorkHours");
const Holiday = require("../models/Holiday");
const PublicHoliday = require("../models/PublicHoliday");
const Group = require("../models/Group");
const { formatDateForDisplay, formatDate } = require("../utils/dateUtils");
const { prepareMessages } = require("../utils/messageUtils");

// Get dashboard page with all employees' hours for a specific month
router.get("/", async (req, res) => {
  try {
    // Get the current date if no month/year specified
    const today = new Date();
    const selectedMonth = parseInt(req.query.month) || today.getMonth() + 1;
    const selectedYear = parseInt(req.query.year) || today.getFullYear();

    // Format dates for query
    const formattedMonth = selectedMonth.toString().padStart(2, "0");
    const startDate = `${selectedYear}-${formattedMonth}-01`;

    // Get the last day of the month
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    const endDate = `${selectedYear}-${formattedMonth}-${lastDay}`;

    // Get all users
    const users = await User.getAll();

    // Get all groups
    const groups = await Group.findAll();

    // Create a map to access groups by id
    const groupMap = {};
    groups.forEach((group) => {
      groupMap[group.id] = {
        id: group.id,
        name: group.name,
        employees: [],
      };
    });

    // Add "No Group" category
    groupMap[0] = {
      id: 0,
      name: "Bez grupy",
      employees: [],
    };

    // Get public holidays for the selected month
    const publicHolidays = await PublicHoliday.findByMonthAndYear(
      selectedMonth,
      selectedYear
    );

    // Format public holiday dates
    publicHolidays.forEach((holiday) => {
      holiday.holiday_date = formatDateForDisplay(holiday.holiday_date);
    });

    // Prepare data for all users
    for (const user of users) {
      // Get work hours for this user in the selected month
      const workHours = await WorkHours.findByUserAndDateRange(
        user.id,
        startDate,
        endDate
      );

      // Format work hours dates
      workHours.forEach((entry) => {
        entry.work_date = formatDateForDisplay(entry.work_date);
      });

      // Get holidays for this user in the selected month
      const holidays = await Holiday.findByUserAndDateRange(
        user.id,
        startDate,
        endDate
      );

      // Format holiday dates
      holidays.forEach((holiday) => {
        holiday.holiday_date = formatDateForDisplay(holiday.holiday_date);
      });

      // Calculate total working hours for the month
      const totalHours = workHours.reduce(
        (total, entry) => total + entry.total_hours,
        0
      );

      // Create an object with dates mapped to hours worked
      const dateToHoursMap = {};
      workHours.forEach((entry) => {
        const date = formatDate(entry.work_date);
        dateToHoursMap[date] = entry.total_hours;
      });

      // Create a map of dates to holiday status
      const holidayDates = holidays.map((h) => formatDate(h.holiday_date));

      // Add user data to the appropriate group
      const groupId = user.group_id || 0; // Use 0 for users without a group

      groupMap[groupId].employees.push({
        user: user,
        totalHours: totalHours,
        dateToHoursMap: dateToHoursMap,
        holidays: holidayDates,
      });
    }

    // Convert groupMap to array and sort groups
    const groupedEmployees = Object.values(groupMap)
      .filter((group) => group.employees.length > 0) // Only include groups with employees
      .sort((a, b) => {
        // Sort "No Group" to the end
        if (a.id === 0) return 1;
        if (b.id === 0) return -1;
        // Otherwise sort alphabetically
        return a.name.localeCompare(b.name);
      });

    // Create a date range for the month (all days)
    const daysInMonth = [];
    for (let i = 1; i <= lastDay; i++) {
      const currentDate = `${selectedYear}-${formattedMonth}-${i
        .toString()
        .padStart(2, "0")}`;
      daysInMonth.push(currentDate);
    }

    // Map public holidays for easy checking
    const publicHolidayDates = publicHolidays.map((ph) =>
      formatDate(ph.holiday_date)
    );

    const publicHolidayMap = {};
    publicHolidays.forEach((ph) => {
      const date = formatDate(ph.holiday_date);
      publicHolidayMap[date] = ph.name;
    });

    // Calculate required monthly hours
    const { getWeekdaysInMonth } = require("../utils/dateUtils");
    const hoursPerDay = 8;
    const workDaysInMonth = getWeekdaysInMonth(selectedYear, selectedMonth);

    // Count all public holidays for the calculation
    const totalPublicHolidaysCount = publicHolidays.length;

    const requiredMonthlyHours =
      (workDaysInMonth - totalPublicHolidaysCount) * hoursPerDay;

    res.render("dashboard/index", {
      title: "Dashboard pracowników",
      currentPage: "employees-dashboard",
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user,
      groupedEmployees: groupedEmployees,
      daysInMonth: daysInMonth,
      selectedMonth: selectedMonth,
      selectedYear: selectedYear,
      publicHolidays: publicHolidayMap,
      messages: prepareMessages(req.query),
      requiredMonthlyHours: requiredMonthlyHours,
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).render("error", {
      title: "Błąd",
      message: "Nie udało się załadować danych dashboardu",
      error: error,
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      currentPage: "error",
    });
  }
});

module.exports = router;
