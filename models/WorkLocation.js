/**
 * WorkLocation model handles planned/recorded work location (onsite/remote) per day.
 * It is kept separate from work hours so users can plan location even without hours.
 */
const { dbAsync } = require("../db/database");

class WorkLocation {
  constructor(data) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.work_date = data.work_date;
    this.is_onsite = WorkLocation.normalizeIsOnsite(data.is_onsite);
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  static normalizeIsOnsite(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return value === "true";
    }
    return !!value;
  }

  /**
   * Check if a work date should be remote (false) due to being a weekend or holiday.
   * Weekends and holidays must always be remote work.
   * @param {number} userId - The user ID
   * @param {string} workDate - The work date in YYYY-MM-DD format
   * @returns {Promise<boolean>} True if the date should be remote, false otherwise
   */
  static async shouldBeRemote(userId, workDate) {
    const dateObj = new Date(workDate);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (isWeekend) return true;

    const Holiday = require("./Holiday");
    const isHoliday = await Holiday.isHoliday(userId, workDate);
    return isHoliday;
  }

  static async findByUserAndDate(userId, workDate) {
    const row = await dbAsync.get(
      "SELECT * FROM work_locations WHERE user_id = $1 AND work_date = $2",
      [userId, workDate]
    );
    return row ? new WorkLocation(row) : null;
  }

  static async findByUserAndDateRange(userId, startDate, endDate) {
    const rows = await dbAsync.all(
      `SELECT * FROM work_locations
       WHERE user_id = $1 AND work_date BETWEEN $2 AND $3
       ORDER BY work_date`,
      [userId, startDate, endDate]
    );
    return rows.map((row) => new WorkLocation(row));
  }

  // Get all locations for all users in a date range (for dashboards)
  static async findAllByDateRange(startDate, endDate) {
    const rows = await dbAsync.all(
      `SELECT * FROM work_locations
       WHERE work_date BETWEEN $1 AND $2
       ORDER BY user_id, work_date`,
      [startDate, endDate]
    );
    return rows.map((row) => new WorkLocation(row));
  }

  static async createOrUpdate(data) {
    if (!data || !data.user_id || !data.work_date) {
      throw new Error("Missing required work location data.");
    }

    // Enforce rule: weekends and holidays must be remote
    const mustBeRemote = await this.shouldBeRemote(data.user_id, data.work_date);
    const isOnsite = mustBeRemote
      ? false
      : this.normalizeIsOnsite(data.is_onsite);

    const result = await dbAsync.run(
      `INSERT INTO work_locations (user_id, work_date, is_onsite, created_at, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, work_date)
       DO UPDATE SET is_onsite = EXCLUDED.is_onsite, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [data.user_id, data.work_date, isOnsite]
    );

    if (result.rows && result.rows.length > 0) {
      return new WorkLocation(result.rows[0]);
    }
    throw new Error("Failed to create or update work location.");
  }

  static async deleteByUserAndDate(userId, workDate) {
    const result = await dbAsync.run(
      "DELETE FROM work_locations WHERE user_id = $1 AND work_date = $2",
      [userId, workDate]
    );
    return result.rowCount > 0;
  }
}

module.exports = WorkLocation;
