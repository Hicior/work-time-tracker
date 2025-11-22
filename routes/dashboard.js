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
const WorkLocation = require("../models/WorkLocation");
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
    const endDate = `${selectedYear}-${formattedMonth}-${lastDay
      .toString()
      .padStart(2, "0")}`;

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

    // Fetch all work hours, locations and holidays for all users in batch queries (instead of N*2 queries)
    const allWorkHours = await WorkHours.findAllByDateRange(startDate, endDate);
    const allLocations = await WorkLocation.findAllByDateRange(
      startDate,
      endDate
    );
    const allHolidays = await Holiday.findAllByDateRange(startDate, endDate);

    // Group work hours by user_id for O(1) lookup
    const workHoursByUser = {};
    allWorkHours.forEach((entry) => {
      if (!workHoursByUser[entry.user_id]) {
        workHoursByUser[entry.user_id] = [];
      }
      workHoursByUser[entry.user_id].push(entry);
    });

    // Group locations by user_id for O(1) lookup
    const locationsByUser = {};
    allLocations.forEach((entry) => {
      if (!locationsByUser[entry.user_id]) {
        locationsByUser[entry.user_id] = [];
      }
      locationsByUser[entry.user_id].push(entry);
    });

    // Group holidays by user_id for O(1) lookup
    const holidaysByUser = {};
    allHolidays.forEach((holiday) => {
      if (!holidaysByUser[holiday.user_id]) {
        holidaysByUser[holiday.user_id] = [];
      }
      holidaysByUser[holiday.user_id].push(holiday);
    });

    // Prepare data for all users using pre-fetched data
    for (const user of users) {
      // Get work hours for this user from the pre-fetched map
      const workHours = workHoursByUser[user.id] || [];

      // Format work hours dates
      workHours.forEach((entry) => {
        entry.work_date = formatDateForDisplay(entry.work_date);
      });

      // Get holidays for this user from the pre-fetched map
      const holidays = holidaysByUser[user.id] || [];

      // Format holiday dates
      holidays.forEach((holiday) => {
        holiday.holiday_date = formatDateForDisplay(holiday.holiday_date);
      });

      // Calculate total working hours for the month
      const totalHours = workHours.reduce(
        (total, entry) => total + entry.total_hours,
        0
      );

      // Create an object with dates mapped to hours worked and location
      const dateToHoursMap = {};
      const dateToLocationMap = {};
      const userLocations = locationsByUser[user.id] || [];
      userLocations.forEach((loc) => {
        const date = formatDate(loc.work_date);
        dateToLocationMap[date] = loc.is_onsite;
      });
      workHours.forEach((entry) => {
        const date = formatDate(entry.work_date);
        dateToHoursMap[date] = entry.total_hours;
        if (dateToLocationMap[date] === undefined) {
          dateToLocationMap[date] = entry.is_onsite;
        }
      });

      // Create a map of dates to holiday status
      const holidayDates = holidays.map((h) => formatDate(h.holiday_date));

      // Add user data to the appropriate group
      const groupId = user.group_id || 0; // Use 0 for users without a group

      groupMap[groupId].employees.push({
        user: user,
        totalHours: totalHours,
        dateToHoursMap: dateToHoursMap,
        dateToLocationMap: dateToLocationMap,
        holidays: holidayDates,
      });
    }

    // Convert groupMap to array and filter groups with active employees
    const groupedEmployees = Object.values(groupMap)
      .filter((group) => {
        // Filter to only include groups with active employees (those with holidays or work hours)
        const activeEmployees = group.employees.filter(emp => 
          emp.holidays.length > 0 || emp.totalHours > 0
        );
        return activeEmployees.length > 0;
      })
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
    const isDevelopment = process.env.NODE_ENV !== 'production';
    res.status(500).render("error", {
      title: "Błąd",
      message: "Nie udało się załadować danych dashboardu",
      error: isDevelopment ? error : null,
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      currentPage: "error",
    });
  }
});

module.exports = router;
