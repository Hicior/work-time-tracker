/**
 * PostgreSQL database schema initialization file for the Work Time Tracker application.
 * Creates all necessary tables (users, groups, work_hours, holidays, public_holidays) if they don't exist
 * and sets up database indexes for improved query performance.
 */
const { pool } = require("./database");
const logger = require("../utils/logger").createModuleLogger("Schema");

async function createSchema() {
  try {
    // Create tables in a transaction
    await pool.query("BEGIN");

    // Groups table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        auth0_id TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user', 'manager')),
        group_id INTEGER,
        is_blocked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups (id)
      )
    `);

    // Work hours table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS work_hours (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        work_date DATE NOT NULL,
        total_hours REAL NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id, work_date)
      )
    `);

    // Work locations table (separate from work_hours to allow planning without hours)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS work_locations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        work_date DATE NOT NULL,
        is_onsite BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id, work_date)
      )
    `);

    // Holidays table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS holidays (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        holiday_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id, holiday_date)
      )
    `);

    // Public holidays table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public_holidays (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        holiday_date DATE NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_work_hours_user_id ON work_hours(user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_work_hours_work_date ON work_hours(work_date)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_holidays_user_id ON holidays(user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(holiday_date)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_users_group_id ON users(group_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_public_holidays_date ON public_holidays(holiday_date)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_work_locations_user_id ON work_locations(user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_work_locations_work_date ON work_locations(work_date)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_work_locations_is_onsite ON work_locations(is_onsite)`
    );

    await pool.query("COMMIT");
    logger.info("PostgreSQL database schema created successfully");
  } catch (error) {
    await pool.query("ROLLBACK");
    logger.error({ err: error }, "Error creating PostgreSQL schema");
    throw error;
  }
}

async function schemaExists() {
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      ) as exists
    `);
    return result.rows[0].exists;
  } catch (error) {
    logger.error({ err: error }, "Error checking schema existence");
    return false;
  }
}

// Run the function if this file is executed directly
if (require.main === module) {
  createSchema()
    .then(() => {
      logger.info("Schema creation completed");
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, "Schema creation failed");
      process.exit(1);
    });
}

module.exports = { createSchema, schemaExists };
