/**
 * Date utility functions for the Work Time Tracker application.
 * Provides helper functions for date-related operations such as
 * calculating weekdays in a month and formatting day names.
 * Supports calculations for work days and holiday statistics.
 */
function getWeekdaysInMonth(year, month) {
  // Ensure month is 1-based for Date constructor's month index (0-based)
  const monthIndex = month - 1;
  let weekdays = 0;
  const date = new Date(year, monthIndex, 1);

  while (date.getMonth() === monthIndex) {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      // Monday to Friday
      weekdays++;
    }
    date.setDate(date.getDate() + 1);
  }

  return weekdays;
}

function getDayOfWeekName(dateString) {
  const date = new Date(dateString);
  const days = [
    "Niedziela",
    "Poniedziałek",
    "Wtorek",
    "Środa",
    "Czwartek",
    "Piątek",
    "Sobota",
  ];
  return days[date.getDay()];
}

function getDayOfWeekAbbr(dateString) {
  const date = new Date(dateString);
  const daysAbbr = ["nd", "pn", "wt", "śr", "czw", "pt", "sb"];
  return daysAbbr[date.getDay()];
}

/**
 * Format dates consistently regardless of whether they come as
 * strings (SQLite) or date objects (PostgreSQL)
 * @param {Date|string} dateValue - The date value to format
 * @returns {string} Formatted date string in YYYY-MM-DD format
 */
function formatDate(dateValue) {
  if (!dateValue) return null;

  // If it's already a string in YYYY-MM-DD format, return it
  if (typeof dateValue === "string" && dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateValue;
  }

  // If it's a string with time component, strip it
  if (typeof dateValue === "string" && dateValue.includes("T")) {
    return dateValue.split("T")[0];
  }

  // If it's a Date object or another string format
  try {
    // For PostgreSQL, date objects might be returned directly
    // or date strings in this format: "Thu May 01 2025 00:00:00 GMT+0200"
    const date = new Date(dateValue);
    if (date instanceof Date && !isNaN(date)) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    console.error("Error parsing date:", e, dateValue);
  }

  // If all else fails, return the original value
  return String(dateValue);
}

/**
 * Format date for display in templates, handling various date formats
 * including "Mon May 05 2025 00:00:00 GMT+0200" format
 * @param {Date|string} dateValue - The date value to format
 * @returns {string} Formatted date string in YYYY-MM-DD format
 */
function formatDateForDisplay(dateValue) {
  if (!dateValue) return "";

  try {
    // Handle case for "Mon May 05 2025 00:00:00 GMT+0200" format
    const date = new Date(dateValue);
    if (date instanceof Date && !isNaN(date)) {
      return date.toISOString().split("T")[0];
    }
  } catch (e) {
    console.error("Error formatting date:", e);
  }

  // If parsing fails, use our standard formatDate function
  return formatDate(dateValue) || String(dateValue);
}

/**
 * Format date for display in templates with proper localization, including time
 * @param {Date|string} dateValue - The date value to format
 * @param {string} locale - The locale to use (default: 'pl-PL')
 * @returns {string} Formatted localized date and time string
 */
function formatDateTimeForDisplay(dateValue, locale = "pl-PL") {
  if (!dateValue) return "";

  try {
    // Handle PostgreSQL timestamp format (2023-05-01 02:00:00+02)
    let date;

    if (typeof dateValue === "string") {
      // Check if it's a PostgreSQL timestamp with timezone
      if (dateValue.includes("+")) {
        // Extract the timestamp part without timezone
        const timestampPart = dateValue.split("+")[0].trim();
        // Create a date object with local timezone interpretation
        date = new Date(timestampPart);
      } else {
        date = new Date(dateValue);
      }
    } else if (dateValue instanceof Date) {
      date = dateValue;
    } else {
      return String(dateValue);
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.error("Invalid date value:", dateValue);
      return String(dateValue);
    }

    // Format with locale and options
    const options = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false, // Use 24-hour format
    };

    return date.toLocaleString(locale, options);
  } catch (e) {
    console.error("Error formatting date and time:", e, dateValue);
    return String(dateValue);
  }
}

/**
 * Format date for display as "D MonthNameGenitive" (e.g., "2 Maja").
 * @param {Date|string} dateValue - The date value to format.
 * @returns {string} Formatted date string (e.g., "2 Maja").
 */
function formatDayAndMonthGenitive(dateValue) {
  if (!dateValue) return "";

  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      console.error(
        "Invalid date value for formatDayAndMonthGenitive:",
        dateValue
      );
      return String(dateValue);
    }

    const day = date.getDate();
    const monthIndex = date.getMonth(); // 0-indexed

    const monthNamesGenitive = [
      "stycznia",
      "lutego",
      "marca",
      "kwietnia",
      "maja",
      "czerwca",
      "lipca",
      "sierpnia",
      "września",
      "października",
      "listopada",
      "grudnia",
    ];

    return `${day} ${monthNamesGenitive[monthIndex]}`;
  } catch (e) {
    console.error("Error formatting day and month genitive:", e, dateValue);
    return String(dateValue);
  }
}

module.exports = {
  getWeekdaysInMonth,
  getDayOfWeekName,
  getDayOfWeekAbbr,
  formatDate,
  formatDateForDisplay,
  formatDateTimeForDisplay,
  formatDayAndMonthGenitive,
};
