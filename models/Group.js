/**
 * Group model for the Work Time Tracker application.
 * Manages user groups/teams to organize users within the system.
 * Provides methods for creating, updating, and deleting groups,
 * as well as retrieving users belonging to specific groups.
 * Prevents deletion of groups with assigned users to maintain data integrity.
 */
const { dbAsync } = require("../db/database");

class Group {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.created_at = data.created_at;
  }

  // Get group by ID
  static async findById(id) {
    try {
      const group = await dbAsync.get("SELECT * FROM groups WHERE id = $1", [
        id,
      ]);
      return group ? new Group(group) : null;
    } catch (error) {
      console.error("Error finding group by ID:", error);
      throw error;
    }
  }

  // Get group by name
  static async findByName(name) {
    try {
      const group = await dbAsync.get("SELECT * FROM groups WHERE name = $1", [
        name,
      ]);
      return group ? new Group(group) : null;
    } catch (error) {
      console.error("Error finding group by name:", error);
      throw error;
    }
  }

  // Get all groups
  static async findAll() {
    try {
      const groups = await dbAsync.all("SELECT * FROM groups ORDER BY name");
      return groups.map((group) => new Group(group));
    } catch (error) {
      console.error("Error finding all groups:", error);
      throw error;
    }
  }

  // Create new group
  static async create(groupData) {
    try {
      // Check if the group already exists
      const existingGroup = await Group.findByName(groupData.name);
      if (existingGroup) {
        return existingGroup;
      }

      const result = await dbAsync.run(
        "INSERT INTO groups (name) VALUES ($1) RETURNING id",
        [groupData.name]
      );

      const newId = result.rows[0].id;
      const newGroup = await Group.findById(newId);
      return newGroup;
    } catch (error) {
      console.error("Error creating group:", error);
      throw error;
    }
  }

  // Update group
  async update(updateData) {
    try {
      const result = await dbAsync.run(
        "UPDATE groups SET name = $1 WHERE id = $2",
        [updateData.name || this.name, this.id]
      );

      if (result.rowCount > 0) {
        Object.assign(this, updateData);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error updating group:", error);
      throw error;
    }
  }

  // Delete group
  async delete() {
    try {
      // Check if there are any users in this group
      const users = await dbAsync.all(
        "SELECT id FROM users WHERE group_id = $1",
        [this.id]
      );
      if (users.length > 0) {
        throw new Error("Cannot delete group with assigned users");
      }

      const result = await dbAsync.run("DELETE FROM groups WHERE id = $1", [
        this.id,
      ]);
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting group:", error);
      throw error;
    }
  }

  // Get users in this group
  async getUsers() {
    try {
      const users = await dbAsync.all(
        "SELECT * FROM users WHERE group_id = $1 ORDER BY name",
        [this.id]
      );

      // We import User here to avoid circular dependencies
      const User = require("./User");
      return users.map((user) => new User(user));
    } catch (error) {
      console.error("Error getting users in group:", error);
      throw error;
    }
  }
}

module.exports = Group;
