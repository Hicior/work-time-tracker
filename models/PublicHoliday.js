/**
 * Model for public holidays in the Work Time Tracker application.
 * Handles CRUD operations for public holidays that apply to all users.
 */

const { dbAsync } = require("../db/database");
const logger = require("../utils/logger").createModuleLogger("PublicHoliday");

class PublicHoliday {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.holiday_date = data.holiday_date;
    this.created_at = data.created_at;
  }

  // Create a new public holiday
  static async create(holidayData) {
    try {
      const { name, holiday_date } = holidayData;

      const result = await dbAsync.run(
        "INSERT INTO public_holidays (name, holiday_date) VALUES ($1, $2) RETURNING id",
        [name, holiday_date]
      );

      const newId = result.rows[0].id;

      logger.info({ name, holidayDate: holiday_date }, "Public holiday created");
      return new PublicHoliday({
        id: newId,
        name,
        holiday_date,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ err: error, name: holidayData.name, holidayDate: holidayData.holiday_date }, "Failed to create public holiday");
      throw error;
    }
  }

  // Find all public holidays
  static async findAll() {
    const rows = await dbAsync.all(
      "SELECT * FROM public_holidays ORDER BY holiday_date ASC"
    );
    return rows.map((row) => new PublicHoliday(row));
  }

  // Find public holidays by year
  static async findByYear(year) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const rows = await dbAsync.all(
      "SELECT * FROM public_holidays WHERE holiday_date BETWEEN $1 AND $2 ORDER BY holiday_date ASC",
      [startDate, endDate]
    );
    return rows.map((row) => new PublicHoliday(row));
  }

  // Find public holidays by month and year
  static async findByMonthAndYear(month, year) {
    const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month.toString().padStart(2, "0")}-${lastDay}`;

    const rows = await dbAsync.all(
      "SELECT * FROM public_holidays WHERE holiday_date BETWEEN $1 AND $2 ORDER BY holiday_date ASC",
      [startDate, endDate]
    );
    return rows.map((row) => new PublicHoliday(row));
  }

  // Find public holidays by date range
  static async findByDateRange(startDate, endDate) {
    const rows = await dbAsync.all(
      "SELECT * FROM public_holidays WHERE holiday_date BETWEEN $1 AND $2 ORDER BY holiday_date ASC",
      [startDate, endDate]
    );
    return rows.map((row) => new PublicHoliday(row));
  }

  // Find public holiday by ID
  static async findById(id) {
    const row = await dbAsync.get(
      "SELECT * FROM public_holidays WHERE id = $1",
      [id]
    );
    return row ? new PublicHoliday(row) : null;
  }

  // Delete a public holiday
  async delete() {
    try {
      const result = await dbAsync.run(
        "DELETE FROM public_holidays WHERE id = $1",
        [this.id]
      );
      if (result.rowCount > 0) {
        logger.info({ name: this.name, holidayDate: this.holiday_date }, "Public holiday deleted");
      }
      return result.rowCount > 0;
    } catch (error) {
      logger.error({ err: error, name: this.name, holidayDate: this.holiday_date }, "Failed to delete public holiday");
      throw error;
    }
  }
}

module.exports = PublicHoliday;
