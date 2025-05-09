/**
 * Model for public holidays in the Work Time Tracker application.
 * Handles CRUD operations for public holidays that apply to all users.
 */

const { dbAsync } = require("../db/database");

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

      return new PublicHoliday({
        id: newId,
        name,
        holiday_date,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error creating public holiday:", error);
      throw error;
    }
  }

  // Find all public holidays
  static async findAll() {
    try {
      const rows = await dbAsync.all(
        "SELECT * FROM public_holidays ORDER BY holiday_date ASC"
      );
      return rows.map((row) => new PublicHoliday(row));
    } catch (error) {
      console.error("Error finding all public holidays:", error);
      throw error;
    }
  }

  // Find public holidays by year
  static async findByYear(year) {
    try {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const rows = await dbAsync.all(
        "SELECT * FROM public_holidays WHERE holiday_date BETWEEN $1 AND $2 ORDER BY holiday_date ASC",
        [startDate, endDate]
      );
      return rows.map((row) => new PublicHoliday(row));
    } catch (error) {
      console.error("Error finding public holidays by year:", error);
      throw error;
    }
  }

  // Find public holidays by month and year
  static async findByMonthAndYear(month, year) {
    try {
      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, "0")}-${lastDay}`;

      const rows = await dbAsync.all(
        "SELECT * FROM public_holidays WHERE holiday_date BETWEEN $1 AND $2 ORDER BY holiday_date ASC",
        [startDate, endDate]
      );
      return rows.map((row) => new PublicHoliday(row));
    } catch (error) {
      console.error("Error finding public holidays by month and year:", error);
      throw error;
    }
  }

  // Find public holiday by ID
  static async findById(id) {
    try {
      const row = await dbAsync.get(
        "SELECT * FROM public_holidays WHERE id = $1",
        [id]
      );
      return row ? new PublicHoliday(row) : null;
    } catch (error) {
      console.error("Error finding public holiday by id:", error);
      throw error;
    }
  }

  // Delete a public holiday
  async delete() {
    try {
      const result = await dbAsync.run(
        "DELETE FROM public_holidays WHERE id = $1",
        [this.id]
      );
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting public holiday:", error);
      throw error;
    }
  }
}

module.exports = PublicHoliday;
