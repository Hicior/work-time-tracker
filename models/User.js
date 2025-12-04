/**
 * User model for the Work Time Tracker application.
 * Manages user data including authentication with Auth0, role management (admin/user/manager),
 * and user profile operations. Provides methods for finding, creating, and updating users.
 * Handles user authentication state and permissions through role-based access control.
 */
const { dbAsync } = require("../db/database");
const logger = require("../utils/logger").createModuleLogger("User");

class User {
  constructor(data) {
    this.id = data.id;
    this.auth0_id = data.auth0_id;
    this.email = data.email;
    this.name = data.name;
    this.role = data.role;
    this.group_id = data.group_id;
    this.is_blocked = data.is_blocked;
    this.created_at = data.created_at;
    this.last_login = data.last_login;
  }

  // Find user by internal ID
  static async findById(id) {
    const user = await dbAsync.get("SELECT * FROM users WHERE id = $1", [id]);
    return user ? new User(user) : null;
  }

  // Find user by Auth0 ID
  static async findByAuth0Id(auth0Id) {
    const user = await dbAsync.get(
      "SELECT * FROM users WHERE auth0_id = $1",
      [auth0Id]
    );
    return user ? new User(user) : null;
  }

  // Find user by email
  static async findByEmail(email) {
    const user = await dbAsync.get("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    return user ? new User(user) : null;
  }

  // Create new user from Auth0 profile
  static async createFromAuth0(auth0User) {
    try {
      if (!auth0User || !auth0User.sub || !auth0User.email) {
        throw new Error("Invalid Auth0 user data");
      }

      // Check if user already exists by Auth0 ID or email
      const existingUserByAuth0 = await User.findByAuth0Id(auth0User.sub);
      if (existingUserByAuth0) {
        // Update last login time and blocked status
        // PERFORMANCE OPTIMIZATION: Only update last_login if it hasn't been updated in the last hour
        // This prevents excessive database writes on every request while still tracking recent activity
        await dbAsync.run(
          "UPDATE users SET last_login = CURRENT_TIMESTAMP, is_blocked = $1 WHERE id = $2 AND (last_login IS NULL OR last_login < NOW() - INTERVAL '1 hour')",
          [auth0User.blocked || false, existingUserByAuth0.id]
        );
        return await User.findById(existingUserByAuth0.id);
      }

      const existingUserByEmail = await User.findByEmail(auth0User.email);
      if (existingUserByEmail) {
        // Link existing account with Auth0 ID and update last login and blocked status
        // PERFORMANCE OPTIMIZATION: Only update last_login if it hasn't been updated in the last hour
        await dbAsync.run(
          "UPDATE users SET auth0_id = $1, last_login = CURRENT_TIMESTAMP, is_blocked = $2 WHERE id = $3 AND (last_login IS NULL OR last_login < NOW() - INTERVAL '1 hour')",
          [auth0User.sub, auth0User.blocked || false, existingUserByEmail.id]
        );
        return await User.findById(existingUserByEmail.id);
      }

      // Determine role (can be expanded later with more sophisticated logic)
      // By default, all new users are regular users
      const role = "user";

      // Create new user
      const result = await dbAsync.run(
        "INSERT INTO users (auth0_id, email, role, is_blocked) VALUES ($1, $2, $3, $4) RETURNING id",
        [auth0User.sub, auth0User.email, role, auth0User.blocked || false]
      );

      const newUserId = result.rows[0].id;
      logger.info({ userId: newUserId, email: auth0User.email }, "New user registered");
      return await User.findById(newUserId);
    } catch (error) {
      logger.error({ err: error, email: auth0User?.email }, "Failed to create user from Auth0");
      throw error;
    }
  }

  // Update user details
  async update(updateData) {
    try {
      // Only allow updating certain fields
      const allowedFields = ["role", "group_id", "is_blocked", "name"];
      const updates = [];
      const values = [];
      let paramCounter = 1;

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updates.push(`${field} = $${paramCounter}`);
          values.push(updateData[field]);
          paramCounter++;
        }
      }

      if (updates.length === 0) {
        return false; // Nothing to update
      }

      values.push(this.id); // Add id for WHERE clause

      const result = await dbAsync.run(
        `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramCounter}`,
        values
      );

      // Update instance properties if successful
      if (result.rowCount > 0) {
        for (const field of allowedFields) {
          if (updateData[field] !== undefined) {
            this[field] = updateData[field];
          }
        }
        return true;
      }
      return false;
    } catch (error) {
      logger.error({ err: error, userId: this.id }, "Failed to update user");
      throw error;
    }
  }

  // Check if user is an admin
  isAdmin() {
    return this.role === "admin";
  }

  // Check if user is a manager
  isManager() {
    return this.role === "manager";
  }

  // Check if user has elevated permissions (admin or manager)
  hasElevatedPermissions() {
    const result = this.role === "admin" || this.role === "manager";
    return result;
  }

  // Get all users (admin function)
  static async getAll() {
    const users = await dbAsync.all("SELECT * FROM users ORDER BY email");
    return users.map((user) => new User(user));
  }

  // Set user role (admin function)
  static async setRole(userId, role) {
    try {
      if (!["admin", "user", "manager"].includes(role)) {
        throw new Error("Invalid role");
      }

      const result = await dbAsync.run(
        "UPDATE users SET role = $1 WHERE id = $2",
        [role, userId]
      );

      if (result.rowCount > 0) {
        logger.info({ userId, newRole: role }, "User role changed");
      }
      return result.rowCount > 0;
    } catch (error) {
      logger.error({ err: error, userId, role }, "Failed to set user role");
      throw error;
    }
  }

  // Update user block status
  static async updateBlockStatus(userId, isBlocked) {
    try {
      const result = await dbAsync.run(
        "UPDATE users SET is_blocked = $1 WHERE id = $2",
        [isBlocked, userId]
      );

      if (result.rowCount > 0) {
        logger.info({ userId, blocked: isBlocked }, isBlocked ? "User blocked" : "User unblocked");
      }
      return result.rowCount > 0;
    } catch (error) {
      logger.error({ err: error, userId, isBlocked }, "Failed to update user block status");
      throw error;
    }
  }

  // Sync user from Auth0 data
  static async syncFromAuth0Data(auth0User) {
    if (!auth0User || !auth0User.user_id) {
      throw new Error("Invalid Auth0 user data");
    }

    // Check if user exists by Auth0 ID
    const existingUser = await User.findByAuth0Id(auth0User.user_id);

    if (existingUser) {
      // Update existing user with Auth0 data
      const isBlocked = auth0User.blocked === true;

      await dbAsync.run(
        "UPDATE users SET email = $1, is_blocked = $2, last_login = $3 WHERE id = $4",
        [
          auth0User.email,
          isBlocked,
          auth0User.last_login || new Date(),
          existingUser.id,
        ]
      );
      return true;
    } else {
      // Create new user from Auth0 data if it doesn't exist
      const role = "user";
      const isBlocked = auth0User.blocked === true;

      await dbAsync.run(
        "INSERT INTO users (auth0_id, email, role, is_blocked) VALUES ($1, $2, $3, $4)",
        [auth0User.user_id, auth0User.email, role, isBlocked]
      );
      logger.info({ email: auth0User.email }, "User synced from Auth0");
      return true;
    }
  }

  // Bulk sync all users from Auth0
  static async syncAllFromAuth0(auth0Users) {
    let successCount = 0;
    let failCount = 0;

    for (const auth0User of auth0Users) {
      try {
        await User.syncFromAuth0Data(auth0User);
        successCount++;
      } catch {
        failCount++;
      }
    }

    logger.info({ successCount, failCount, total: auth0Users.length }, "Auth0 user sync completed");
    return { successCount, failCount };
  }
}

module.exports = User;
