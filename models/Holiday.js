/**
 * Holiday model for the Work Time Tracker application.
 * Manages user holiday/time-off records including creation and deletion.
 * Provides methods for retrieving holidays by date ranges, checking if specific
 * days are holidays, and calculating monthly holiday statistics.
 * Supports operations for current, past, and future holiday management.
 */
const { dbAsync } = require("../db/database");

class Holiday {
  constructor(data) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.holiday_date = data.holiday_date;
    this.created_at = data.created_at;
  }

  // Get holiday by ID
  static async findById(id) {
    try {
      const holiday = await dbAsync.get(
        "SELECT * FROM holidays WHERE id = $1",
        [id]
      );
      return holiday ? new Holiday(holiday) : null;
    } catch (error) {
      console.error("Error finding holiday by ID:", error);
      throw error;
    }
  }

  // Get holidays by user ID and date range
  static async findByUserAndDateRange(userId, startDate, endDate) {
    try {
      const holidays = await dbAsync.all(
        "SELECT * FROM holidays WHERE user_id = $1 AND holiday_date BETWEEN $2 AND $3 ORDER BY holiday_date",
        [userId, startDate, endDate]
      );
      return holidays.map((entry) => new Holiday(entry));
    } catch (error) {
      console.error("Error finding holidays by user and date range:", error);
      throw error;
    }
  }

  // Get holidays for all users in a date range, including user information
  static async findAllByDateRange(startDate, endDate) {
    try {
      const holidaysWithUserInfo = await dbAsync.all(
        `SELECT h.id, h.user_id, h.holiday_date, h.created_at, 
                u.name, u.email 
         FROM holidays h
         JOIN users u ON h.user_id = u.id
         WHERE h.holiday_date BETWEEN $1 AND $2
         ORDER BY h.holiday_date, u.name`,
        [startDate, endDate]
      );

      return holidaysWithUserInfo || [];
    } catch (error) {
      console.error(
        "Error finding holidays for all users by date range:",
        error
      );
      // Return empty array instead of throwing to prevent page crash
      return [];
    }
  }

  // Get all holidays for a user
  static async findAllByUser(userId) {
    try {
      const holidays = await dbAsync.all(
        "SELECT * FROM holidays WHERE user_id = $1 ORDER BY holiday_date DESC",
        [userId]
      );
      return holidays.map((entry) => new Holiday(entry));
    } catch (error) {
      console.error("Error finding all holidays for user:", error);
      throw error;
    }
  }

  // Get future holidays for a user
  static async findFutureHolidays(userId, fromDate) {
    try {
      const holidays = await dbAsync.all(
        "SELECT * FROM holidays WHERE user_id = $1 AND holiday_date >= $2 ORDER BY holiday_date",
        [userId, fromDate]
      );
      return holidays.map((entry) => new Holiday(entry));
    } catch (error) {
      console.error("Error finding future holidays for user:", error);
      throw error;
    }
  }

  // Get past holidays for a user
  static async findPastHolidays(userId, beforeDate) {
    try {
      const holidays = await dbAsync.all(
        "SELECT * FROM holidays WHERE user_id = $1 AND holiday_date < $2 ORDER BY holiday_date DESC",
        [userId, beforeDate]
      );
      return holidays.map((entry) => new Holiday(entry));
    } catch (error) {
      console.error("Error finding past holidays for user:", error);
      throw error;
    }
  }

  // Get holidays by user ID and specific date
  static async findByUserAndDate(userId, date) {
    try {
      const holiday = await dbAsync.get(
        "SELECT * FROM holidays WHERE user_id = $1 AND holiday_date = $2",
        [userId, date]
      );
      return holiday ? new Holiday(holiday) : null;
    } catch (error) {
      console.error("Error finding holiday by user and date:", error);
      throw error;
    }
  }

  // Check if a date is a holiday for a user
  static async isHoliday(userId, date) {
    try {
      // Check for user-specific holiday
      const holiday = await Holiday.findByUserAndDate(userId, date);

      // Check for public holiday
      const publicHolidayDate = new Date(date);
      const month = publicHolidayDate.getMonth() + 1;
      const year = publicHolidayDate.getFullYear();

      // Get the PublicHoliday model
      const PublicHoliday = require("./PublicHoliday");

      // Get all public holidays for the month/year
      const publicHolidays = await PublicHoliday.findByMonthAndYear(
        month,
        year
      );

      // Check if the specified date is a public holiday
      const isPublicHoliday = publicHolidays.some(
        (ph) => ph.holiday_date === date
      );

      // Return true if either a user holiday or public holiday
      return !!holiday || isPublicHoliday;
    } catch (error) {
      console.error("Error checking if date is a holiday:", error);
      throw error;
    }
  }

  // Get total holidays by user ID for a month
  static async getTotalMonthlyHolidays(userId, year, month) {
    try {
      const { getMonthDateRange } = require("../utils/dateUtils");
      const { startDate, endDate } = getMonthDateRange(year, month);

      const holidays = await Holiday.findByUserAndDateRange(
        userId,
        startDate,
        endDate
      );

      // Return the count of holidays
      return holidays.length;
    } catch (error) {
      console.error("Error calculating total monthly holidays:", error);
      throw error;
    }
  }

  // Create new holiday entry
  static async create(holidayData) {
    try {
      // Check if the holiday already exists
      const existingHoliday = await Holiday.findByUserAndDate(
        holidayData.user_id,
        holidayData.holiday_date
      );
      if (existingHoliday) {
        return existingHoliday;
      }

      const result = await dbAsync.run(
        "INSERT INTO holidays (user_id, holiday_date) VALUES ($1, $2) RETURNING id",
        [holidayData.user_id, holidayData.holiday_date]
      );

      const newId = result.rows[0].id;
      const newHoliday = await Holiday.findById(newId);
      return newHoliday;
    } catch (error) {
      console.error("Error creating holiday entry:", error);
      throw error;
    }
  }

  // Delete holiday entry
  async delete() {
    try {
      const result = await dbAsync.run("DELETE FROM holidays WHERE id = $1", [
        this.id,
      ]);
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting holiday entry:", error);
      throw error;
    }
  }

  // Delete holiday by user ID and date
  static async deleteByUserAndDate(userId, date) {
    try {
      const result = await dbAsync.run(
        "DELETE FROM holidays WHERE user_id = $1 AND holiday_date = $2",
        [userId, date]
      );
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting holiday by user and date:", error);
      throw error;
    }
  }
}

module.exports = Holiday;
