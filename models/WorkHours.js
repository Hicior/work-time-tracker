/**
 * WorkHours model for the Work Time Tracker application.
 * Manages work time entries for users including creation, updating, and deletion of records.
 * Provides methods for retrieving work hours by user, date ranges, and calculating statistics.
 * Enforces business rules for work hour entries including validation of hours and dates.
 */
const { dbAsync } = require("../db/database");
const { getMonthDateRange } = require("../utils/dateUtils");

class WorkHours {
  constructor(data) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.work_date = data.work_date;
    this.total_hours = data.total_hours;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Get work hours by ID
  static async findById(id) {
    try {
      const workHours = await dbAsync.get(
        "SELECT * FROM work_hours WHERE id = $1",
        [id]
      );
      return workHours ? new WorkHours(workHours) : null;
    } catch (error) {
      console.error("Error finding work hours by ID:", error);
      throw error;
    }
  }

  // Get work hours by user ID and date range
  static async findByUserAndDateRange(userId, startDate, endDate) {
    try {
      const workHours = await dbAsync.all(
        "SELECT * FROM work_hours WHERE user_id = $1 AND work_date BETWEEN $2 AND $3 ORDER BY work_date",
        [userId, startDate, endDate]
      );
      return workHours.map((entry) => new WorkHours(entry));
    } catch (error) {
      console.error("Error finding work hours by user and date range:", error);
      throw error;
    }
  }

  // Get work hours by user ID and specific date
  static async findByUserAndDate(userId, date) {
    try {
      const workHours = await dbAsync.all(
        "SELECT * FROM work_hours WHERE user_id = $1 AND work_date = $2 ORDER BY created_at",
        [userId, date]
      );
      return workHours.map((entry) => new WorkHours(entry));
    } catch (error) {
      console.error("Error finding work hours by user and date:", error);
      throw error;
    }
  }

  // Get total work hours by user ID for a month
  static async getTotalMonthlyHours(userId, year, month) {
    try {
      const { startDate, endDate } = getMonthDateRange(year, month);

      const result = await dbAsync.get(
        "SELECT SUM(total_hours) as total FROM work_hours WHERE user_id = $1 AND work_date BETWEEN $2 AND $3",
        [userId, startDate, endDate]
      );

      return result ? result.total : 0;
    } catch (error) {
      console.error("Error calculating total monthly hours:", error);
      throw error;
    }
  }

  // Get all work hours entries, ordered by user and date
  static async getAllWorkHours() {
    try {
      const workHours = await dbAsync.all(
        "SELECT * FROM work_hours ORDER BY user_id, work_date"
      );
      return workHours.map((entry) => new WorkHours(entry));
    } catch (error) {
      console.error("Error getting all work hours entries:", error);
      throw error;
    }
  }

  // Create new work hours entry
  static async create(workHoursData) {
    try {
      if (
        typeof workHoursData.total_hours !== "number" ||
        workHoursData.total_hours <= 0
      ) {
        throw new Error("Invalid total hours value.");
      }

      const result = await dbAsync.run(
        "INSERT INTO work_hours (user_id, work_date, total_hours) VALUES ($1, $2, $3) RETURNING id",
        [
          workHoursData.user_id,
          workHoursData.work_date,
          workHoursData.total_hours,
        ]
      );

      const newId = result.rows[0].id;
      const newWorkHours = await WorkHours.findById(newId);
      return newWorkHours;
    } catch (error) {
      console.error("Error creating work hours entry:", error);
      if (error.message === "Invalid total hours value.") {
        throw error;
      }
      throw new Error(
        "Database error occurred while creating work hours entry."
      );
    }
  }

  // Create or update work hours entry - checks if entry exists for date and updates it
  static async createOrUpdate(workHoursData) {
    try {
      if (
        typeof workHoursData.total_hours !== "number" ||
        workHoursData.total_hours <= 0
      ) {
        throw new Error("Invalid total hours value.");
      }

      // Check if entry exists for this user and date
      const existingEntries = await this.findByUserAndDate(
        workHoursData.user_id,
        workHoursData.work_date
      );

      if (existingEntries && existingEntries.length > 0) {
        // Entry exists, update it
        const existingEntry = existingEntries[0];
        await existingEntry.update({
          total_hours: workHoursData.total_hours,
        });
        return existingEntry;
      } else {
        // Entry doesn't exist, create new one
        return await this.create(workHoursData);
      }
    } catch (error) {
      console.error("Error creating/updating work hours entry:", error);
      if (error.message === "Invalid total hours value.") {
        throw error;
      }
      throw new Error(
        "Database error occurred while creating/updating work hours entry."
      );
    }
  }

  // Update work hours entry
  async update(updateData) {
    try {
      if (
        updateData.total_hours !== undefined &&
        (typeof updateData.total_hours !== "number" ||
          updateData.total_hours <= 0)
      ) {
        throw new Error("Invalid total hours value.");
      }

      const result = await dbAsync.run(
        "UPDATE work_hours SET total_hours = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [
          updateData.total_hours !== undefined
            ? updateData.total_hours
            : this.total_hours,
          this.id,
        ]
      );

      if (result.rowCount > 0) {
        if (updateData.total_hours !== undefined) {
          this.total_hours = updateData.total_hours;
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error updating work hours entry:", error);
      if (error.message === "Invalid total hours value.") {
        throw error;
      }
      throw new Error(
        "Database error occurred while updating work hours entry."
      );
    }
  }

  // Delete work hours entry
  async delete() {
    try {
      const result = await dbAsync.run("DELETE FROM work_hours WHERE id = $1", [
        this.id,
      ]);
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting work hours entry:", error);
      throw error;
    }
  }
}

module.exports = WorkHours;
