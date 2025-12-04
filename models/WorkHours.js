/**
 * WorkHours model for the Work Time Tracker application.
 * Manages work time entries for users including creation, updating, and deletion of records.
 * Provides methods for retrieving work hours by user, date ranges, and calculating statistics.
 * Enforces business rules for work hour entries including validation of hours and dates.
 */
const { dbAsync } = require("../db/database");
const { getMonthDateRange } = require("../utils/dateUtils");
const WorkLocation = require("./WorkLocation");
const logger = require("../utils/logger").createModuleLogger("WorkHours");

class WorkHours {
  constructor(data) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.work_date = data.work_date;
    this.total_hours = data.total_hours;
    // is_onsite comes from the work_locations table via joins
    this.is_onsite =
      data.is_onsite === undefined ? null : WorkLocation.normalizeIsOnsite(data.is_onsite);
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Get work hours by ID
  static async findById(id) {
    const workHours = await dbAsync.get(
      `SELECT wh.*, wl.is_onsite
       FROM work_hours wh
       LEFT JOIN work_locations wl
         ON wl.user_id = wh.user_id AND wl.work_date = wh.work_date
       WHERE wh.id = $1`,
      [id]
    );
    return workHours ? new WorkHours(workHours) : null;
  }

  // Get work hours by user ID and date range
  static async findByUserAndDateRange(userId, startDate, endDate) {
    const workHours = await dbAsync.all(
      `SELECT wh.*, wl.is_onsite
       FROM work_hours wh
       LEFT JOIN work_locations wl
         ON wl.user_id = wh.user_id AND wl.work_date = wh.work_date
       WHERE wh.user_id = $1 AND wh.work_date BETWEEN $2 AND $3
       ORDER BY wh.work_date`,
      [userId, startDate, endDate]
    );
    return workHours.map((entry) => new WorkHours(entry));
  }

  // Get work hours for all users in a date range
  static async findAllByDateRange(startDate, endDate) {
    const workHours = await dbAsync.all(
      `SELECT wh.*, wl.is_onsite
       FROM work_hours wh
       LEFT JOIN work_locations wl
         ON wl.user_id = wh.user_id AND wl.work_date = wh.work_date
       WHERE wh.work_date BETWEEN $1 AND $2 
       ORDER BY wh.user_id, wh.work_date`,
      [startDate, endDate]
    );
    return workHours.map((entry) => new WorkHours(entry));
  }

  // Get work hours by user ID and specific date
  static async findByUserAndDate(userId, date) {
    const workHours = await dbAsync.all(
      `SELECT wh.*, wl.is_onsite
       FROM work_hours wh
       LEFT JOIN work_locations wl
         ON wl.user_id = wh.user_id AND wl.work_date = wh.work_date
       WHERE wh.user_id = $1 AND wh.work_date = $2
       ORDER BY wh.created_at`,
      [userId, date]
    );
    return workHours.map((entry) => new WorkHours(entry));
  }

  // Get user's first (earliest) work hour record - used to determine user's start date
  static async findFirstByUser(userId) {
    const workHour = await dbAsync.get(
      `SELECT wh.*, wl.is_onsite
       FROM work_hours wh
       LEFT JOIN work_locations wl
         ON wl.user_id = wh.user_id AND wl.work_date = wh.work_date
       WHERE wh.user_id = $1
       ORDER BY wh.work_date ASC
       LIMIT 1`,
      [userId]
    );
    return workHour ? new WorkHours(workHour) : null;
  }

  // Get total work hours by user ID for a month
  static async getTotalMonthlyHours(userId, year, month) {
    const { startDate, endDate } = getMonthDateRange(year, month);

    const result = await dbAsync.get(
      "SELECT SUM(total_hours) as total FROM work_hours WHERE user_id = $1 AND work_date BETWEEN $2 AND $3",
      [userId, startDate, endDate]
    );

    return result ? result.total : 0;
  }

  // Get all work hours entries, ordered by user and date
  static async getAllWorkHours() {
    const workHours = await dbAsync.all(
      `SELECT wh.*, wl.is_onsite
       FROM work_hours wh
       LEFT JOIN work_locations wl
         ON wl.user_id = wh.user_id AND wl.work_date = wh.work_date
       ORDER BY wh.user_id, wh.work_date`
    );
    return workHours.map((entry) => new WorkHours(entry));
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
        [workHoursData.user_id, workHoursData.work_date, workHoursData.total_hours]
      );

      const newId = result.rows[0].id;
      const newWorkHours = await WorkHours.findById(newId);

      // Optional location sync
      if (workHoursData.is_onsite !== undefined) {
        await WorkLocation.createOrUpdate({
          user_id: workHoursData.user_id,
          work_date: workHoursData.work_date,
          is_onsite: workHoursData.is_onsite,
        });
        newWorkHours.is_onsite = WorkLocation.normalizeIsOnsite(workHoursData.is_onsite);
      }

      logger.info({ userId: workHoursData.user_id, workDate: workHoursData.work_date, hours: workHoursData.total_hours }, "Work hours created");
      return newWorkHours;
    } catch (error) {
      logger.error({ err: error, userId: workHoursData.user_id, workDate: workHoursData.work_date }, "Failed to create work hours");
      if (error.message === "Invalid total hours value.") {
        throw error;
      }
      throw new Error(
        "Database error occurred while creating work hours entry."
      );
    }
  }

  // Create or update work hours entry - uses atomic upsert to prevent race conditions
  static async createOrUpdate(workHoursData) {
    try {
      if (
        typeof workHoursData.total_hours !== "number" ||
        workHoursData.total_hours <= 0
      ) {
        throw new Error("Invalid total hours value.");
      }

      // Use PostgreSQL's ON CONFLICT for atomic upsert - prevents race conditions
      // This is safe even with concurrent requests for the same user_id and work_date
      const result = await dbAsync.run(
        `INSERT INTO work_hours (user_id, work_date, total_hours, created_at, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, work_date) 
         DO UPDATE SET 
           total_hours = EXCLUDED.total_hours,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [workHoursData.user_id, workHoursData.work_date, workHoursData.total_hours]
      );

      if (result.rows && result.rows.length > 0) {
        const entry = new WorkHours(result.rows[0]);

        if (workHoursData.is_onsite !== undefined) {
          const location = await WorkLocation.createOrUpdate({
            user_id: workHoursData.user_id,
            work_date: workHoursData.work_date,
            is_onsite: workHoursData.is_onsite,
          });
          entry.is_onsite = location.is_onsite;
        }

        logger.info({ userId: workHoursData.user_id, workDate: workHoursData.work_date, hours: workHoursData.total_hours }, "Work hours saved");
        return entry;
      }

      throw new Error("Failed to create or update work hours entry");
    } catch (error) {
      logger.error({ err: error, userId: workHoursData.user_id, workDate: workHoursData.work_date }, "Failed to save work hours");

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
        if (updateData.is_onsite !== undefined) {
          const location = await WorkLocation.createOrUpdate({
            user_id: this.user_id,
            work_date: this.work_date,
            is_onsite: updateData.is_onsite,
          });
          this.is_onsite = location.is_onsite;
        }
        logger.info({ userId: this.user_id, workDate: this.work_date, hours: this.total_hours }, "Work hours updated");
        return true;
      }
      return false;
    } catch (error) {
      logger.error({ err: error, userId: this.user_id, workDate: this.work_date }, "Failed to update work hours");
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
      if (result.rowCount > 0) {
        logger.info({ userId: this.user_id, workDate: this.work_date }, "Work hours deleted");
      }
      return result.rowCount > 0;
    } catch (error) {
      logger.error({ err: error, userId: this.user_id, workDate: this.work_date }, "Failed to delete work hours");
      throw error;
    }
  }
}

module.exports = WorkHours;
