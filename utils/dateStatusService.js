/**
 * Date Status Service for the Work Time Tracker application.
 * Provides centralized date validation and status checking logic.
 * This is the single source of truth for determining:
 * - Whether a date is a weekend, holiday, or public holiday
 * - Valid dates for work hour entry
 * - UI state for displaying date-dependent sections
 */

const Holiday = require("../models/Holiday");
const PublicHoliday = require("../models/PublicHoliday");
const { formatDate, getDayOfWeekName } = require("./dateUtils");

/**
 * Get comprehensive status information for a specific date and user
 * @param {Date|string} date - The date to check
 * @param {number} userId - The user ID (optional, required for holiday checking)
 * @returns {Promise<Object>} Object containing date status information
 */
async function getDateStatus(date, userId = null) {
  const dateObj = date instanceof Date ? date : new Date(date);
  const formattedDate = formatDate(dateObj);
  const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Get current month and year for public holiday lookup
  const month = dateObj.getMonth() + 1; // JavaScript months are 0-indexed
  const year = dateObj.getFullYear();

  // Check if it's a public holiday
  const publicHolidays = await PublicHoliday.findByMonthAndYear(month, year);
  const publicHolidayDates = new Set(
    publicHolidays.map((ph) => formatDate(ph.holiday_date))
  );
  const isPublicHoliday = publicHolidayDates.has(formattedDate);

  // Check if it's a user holiday (if userId provided)
  let isUserHoliday = false;
  if (userId) {
    isUserHoliday = await Holiday.isHoliday(userId, formattedDate);
  }

  // Determine if this is a valid workday (not weekend, not holiday, not public holiday)
  const isValidWorkday = !isWeekend && !isPublicHoliday && !isUserHoliday;

  return {
    date: dateObj,
    formattedDate,
    dayOfWeek,
    isWeekend,
    isPublicHoliday,
    isUserHoliday,
    isValidWorkday,
  };
}

/**
 * Get valid dates for work hour entry (last 3 working days + weekends/holidays in between)
 * This replaces the getValidDates() function previously in work-hours.js
 * @param {number} userId - The user ID for checking user-specific holidays
 * @returns {Promise<Object>} Object with dates array, today, yesterday, and dayBeforeYesterday
 */
async function getValidDatesForEntry(userId) {
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
    publicHolidaysData.map((holiday) => formatDate(holiday.holiday_date))
  );

  // Check if today is a working day
  const todayFormatted = formatDate(currentDate);
  const isTodayWeekend = [0, 6].includes(currentDate.getDay());
  const isTodayPublicHoliday = publicHolidayDates.has(todayFormatted);
  const isTodayUserHoliday = await Holiday.isHoliday(userId, todayFormatted);

  // Add today regardless of whether it's a working day
  validDates.push({
    date: new Date(currentDate),
    label: "Dzisiaj",
    formattedDate: todayFormatted,
    isWeekend: isTodayWeekend,
    isPublicHoliday: isTodayPublicHoliday,
    isUserHoliday: isTodayUserHoliday,
  });

  // Count today if it's a working day (not weekend and not public holiday and not user holiday)
  if (!isTodayWeekend && !isTodayPublicHoliday && !isTodayUserHoliday) {
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
    const isUserHoliday = await Holiday.isHoliday(userId, previousDateFormatted);

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
      isUserHoliday: isUserHoliday,
    });

    // Count working days (not weekend and not public holiday and not user holiday)
    if (!isWeekend && !isPublicHoliday && !isUserHoliday) {
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
}

/**
 * Determine if the "Today's Location" section should be shown on the dashboard
 * The section should NOT be shown if today is a weekend, public holiday, or user holiday
 * @param {number} userId - The user ID
 * @returns {Promise<boolean>} True if the section should be shown, false otherwise
 */
async function shouldShowTodayLocationSection(userId) {
  const today = new Date();
  const todayStatus = await getDateStatus(today, userId);
  
  // Show the section only if it's a valid workday
  return todayStatus.isValidWorkday;
}

module.exports = {
  getDateStatus,
  getValidDatesForEntry,
  shouldShowTodayLocationSection,
};




