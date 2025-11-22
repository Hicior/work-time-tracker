/**
 * Database connection module for the Work Time Tracker application.
 * Establishes connection to PostgreSQL database and provides Promise-based wrappers
 * for database operations to allow for async/await syntax in the application.
 */
const { Pool } = require("pg");
require("dotenv").config();
const pgTypes = require("pg-types");

// Create database connection pool
// Enable SSL for all environments with certificate validation
// This protects against man-in-the-middle attacks in all environments
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  max: 50, // Maximum pool size
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection cannot be established
  // Add type parsers to standardize date formats
  types: {
    getTypeParser: (dataTypeID, format) => {
      // PostgreSQL date type OID is 1082
      if (dataTypeID === 1082) {
        return (val) => val; // Return date as string in YYYY-MM-DD format
      }
      // PostgreSQL timestamp OID is 1114
      // PostgreSQL timestamp with timezone OID is 1184
      if (dataTypeID === 1114 || dataTypeID === 1184) {
        return (val) => {
          // Convert PostgreSQL timestamp to a formatted string that preserves time information
          if (!val) return null;
          const date = new Date(val);
          if (isNaN(date.getTime())) return val;

          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          const hours = String(date.getHours()).padStart(2, "0");
          const minutes = String(date.getMinutes()).padStart(2, "0");
          const seconds = String(date.getSeconds()).padStart(2, "0");

          return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        };
      }
      // Use default parser for other types
      return pgTypes.getTypeParser(dataTypeID, format);
    },
  },
});

// Log connection success or errors
pool.on("connect", () => {
  console.log("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("PostgreSQL connection error:", err);
});

// Promise wrapper for database operations
const dbAsync = {
  query: (text, params = []) => {
    return pool.query(text, params).then(formatDatesInResult);
  },

  // For single row queries
  queryOne: async (text, params = []) => {
    const result = await pool.query(text, params);
    const formattedResult = formatDatesInResult(result);
    return formattedResult.rows[0];
  },

  // For operations that return affected rows
  execute: async (text, params = []) => {
    const result = await pool.query(text, params);
    const formattedResult = formatDatesInResult(result);
    return {
      rowCount: formattedResult.rowCount,
      rows: formattedResult.rows,
    };
  },

  // Standard PostgreSQL-compatible methods
  all: async (sql, params = []) => {
    const result = await pool.query(sql, params);
    const formattedResult = formatDatesInResult(result);
    return formattedResult.rows;
  },

  get: async (sql, params = []) => {
    const result = await pool.query(sql, params);
    const formattedResult = formatDatesInResult(result);
    return formattedResult.rows[0];
  },

  run: async (sql, params = []) => {
    const result = await pool.query(sql, params);
    const formattedResult = formatDatesInResult(result);
    return {
      rows: formattedResult.rows,
      rowCount: formattedResult.rowCount,
    };
  },

  exec: async (sql) => {
    return pool.query(sql);
  },

  // For transaction support
  transaction: async (callback) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};

/**
 * Format date fields in PostgreSQL query results to YYYY-MM-DD strings
 * @param {Object} result - PostgreSQL query result
 * @returns {Object} - Result with formatted dates
 */
function formatDatesInResult(result) {
  if (!result || !result.rows || !result.rows.length) {
    return result;
  }

  // Process each row in the result
  result.rows = result.rows.map((row) => {
    const newRow = { ...row };
    // Find date fields and format them (common date field names in the app)
    const dateFields = [
      "work_date",
      "holiday_date",
      "created_at",
      "updated_at",
      "last_login",
    ];

    for (const field of dateFields) {
      // Handle both Date objects and timestamp strings
      if (
        newRow[field] instanceof Date ||
        (typeof newRow[field] === "string" &&
          (newRow[field].includes("T") || newRow[field].includes("+")))
      ) {
        let date;

        if (newRow[field] instanceof Date) {
          date = newRow[field];
        } else {
          try {
            // For PostgreSQL timestamps with timezone info
            date = new Date(newRow[field]);
          } catch (e) {
            console.error(`Error parsing date for field ${field}:`, e);
            continue;
          }
        }

        // Skip invalid dates
        if (isNaN(date.getTime())) {
          console.error(`Invalid date in field ${field}:`, newRow[field]);
          continue;
        }

        // Format as YYYY-MM-DD HH:MM:SS to include time info
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");

        newRow[
          field
        ] = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      }
    }
    return newRow;
  });

  return result;
}

module.exports = { dbAsync, pool };
