/**
 * User model for the Work Time Tracker application.
 * Manages user data including authentication with Auth0, role management (admin/user),
 * and user profile operations. Provides methods for finding, creating, and updating users.
 * Handles user authentication state and permissions through role-based access control.
 */
const { dbAsync } = require("../db/database");

class User {
  constructor(data) {
    this.id = data.id;
    this.auth0_id = data.auth0_id;
    this.email = data.email;
    this.role = data.role;
    this.group_id = data.group_id;
    this.is_blocked = data.is_blocked;
    this.created_at = data.created_at;
    this.last_login = data.last_login;
  }

  // Find user by internal ID
  static async findById(id) {
    try {
      const user = await dbAsync.get("SELECT * FROM users WHERE id = $1", [id]);
      return user ? new User(user) : null;
    } catch (error) {
      console.error("Error finding user by ID:", error);
      throw error;
    }
  }

  // Find user by Auth0 ID
  static async findByAuth0Id(auth0Id) {
    try {
      const user = await dbAsync.get(
        "SELECT * FROM users WHERE auth0_id = $1",
        [auth0Id]
      );
      return user ? new User(user) : null;
    } catch (error) {
      console.error("Error finding user by Auth0 ID:", error);
      throw error;
    }
  }

  // Find user by email
  static async findByEmail(email) {
    try {
      const user = await dbAsync.get("SELECT * FROM users WHERE email = $1", [
        email,
      ]);
      return user ? new User(user) : null;
    } catch (error) {
      console.error("Error finding user by email:", error);
      throw error;
    }
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
        await dbAsync.run(
          "UPDATE users SET last_login = CURRENT_TIMESTAMP, is_blocked = $1 WHERE id = $2",
          [auth0User.blocked || false, existingUserByAuth0.id]
        );
        return await User.findById(existingUserByAuth0.id);
      }

      const existingUserByEmail = await User.findByEmail(auth0User.email);
      if (existingUserByEmail) {
        // Link existing account with Auth0 ID and update last login and blocked status
        await dbAsync.run(
          "UPDATE users SET auth0_id = $1, last_login = CURRENT_TIMESTAMP, is_blocked = $2 WHERE id = $3",
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
      return await User.findById(newUserId);
    } catch (error) {
      console.error("Error creating user from Auth0 profile:", error);
      throw error;
    }
  }

  // Update user details
  async update(updateData) {
    try {
      // Only allow updating certain fields
      const allowedFields = ["role", "group_id", "is_blocked"];
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
      console.error("Error updating user:", error);
      throw error;
    }
  }

  // Check if user is an admin
  isAdmin() {
    return this.role === "admin";
  }

  // Get all users (admin function)
  static async getAll() {
    try {
      const users = await dbAsync.all("SELECT * FROM users ORDER BY email");
      return users.map((user) => new User(user));
    } catch (error) {
      console.error("Error getting all users:", error);
      throw error;
    }
  }

  // Set user role (admin function)
  static async setRole(userId, role) {
    try {
      if (!["admin", "user"].includes(role)) {
        throw new Error("Invalid role");
      }

      const result = await dbAsync.run(
        "UPDATE users SET role = $1 WHERE id = $2",
        [role, userId]
      );

      return result.rowCount > 0;
    } catch (error) {
      console.error("Error setting user role:", error);
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

      return result.rowCount > 0;
    } catch (error) {
      console.error("Error updating user block status:", error);
      throw error;
    }
  }

  // Sync user from Auth0 data
  static async syncFromAuth0Data(auth0User) {
    try {
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
        return true;
      }
    } catch (error) {
      console.error("Error syncing user from Auth0 data:", error);
      throw error;
    }
  }

  // Bulk sync all users from Auth0
  static async syncAllFromAuth0(auth0Users) {
    try {
      let successCount = 0;
      let failCount = 0;

      for (const auth0User of auth0Users) {
        try {
          await User.syncFromAuth0Data(auth0User);
          successCount++;
        } catch (error) {
          console.error(`Error syncing user ${auth0User.email}:`, error);
          failCount++;
        }
      }

      return { successCount, failCount };
    } catch (error) {
      console.error("Error in bulk sync from Auth0:", error);
      throw error;
    }
  }
}

module.exports = User;
