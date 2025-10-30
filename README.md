# Work Time Tracker

A comprehensive time tracking system for managing employee work hours, holidays, and generating reports. Built with Node.js, Express, PostgreSQL, and Auth0 for authentication.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Authentication](#authentication)
- [Adding New Features](#adding-new-features)
- [API Endpoints](#api-endpoints)
- [Development Guidelines](#development-guidelines)
- [Common Tasks](#common-tasks)

## Overview

Work Time Tracker is a web application designed to help companies manage employee time tracking, holiday management, and work hour reporting. The system supports multiple user roles (Admin, Manager, User) with different permission levels.

### Key Features

- **Time Tracking**: Employees can log daily work hours
- **Holiday Management**: Request and manage vacation days
- **Public Holidays**: System-wide holiday calendar
- **Groups/Teams**: Organize employees into groups
- **Dashboard**: Overview of all employees' time data
- **Statistics**: Detailed reports and analytics
- **Multi-role Support**: Admin, Manager, and User roles

## Technology Stack

- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL with connection pooling
- **Authentication**: Auth0
- **View Engine**: EJS with ejs-mate layouts
- **Styling**: Tailwind CSS v4
- **Build Tools**: npm, Tailwind CLI
- **Additional Libraries**:
  - axios (HTTP client)
  - dotenv (environment variables)
  - pg (PostgreSQL client)
  - express-openid-connect (Auth0 integration)

## Project Structure

```
work-time-tracker/
├── db/                     # Database related files
│   ├── database.js         # Database connection and query wrappers
│   └── pg-schema.js        # PostgreSQL schema initialization
├── models/                 # Data models
│   ├── User.js            # User model with Auth0 integration
│   ├── WorkHours.js       # Work hours tracking model
│   ├── Holiday.js         # Employee holidays model
│   ├── PublicHoliday.js   # System-wide holidays model
│   └── Group.js           # Employee groups/teams model
├── routes/                 # Express route handlers
│   ├── work-hours.js      # Work hours CRUD operations
│   ├── holidays.js        # Holiday management routes
│   ├── groups.js          # Group management (admin)
│   ├── public-holidays.js # Public holiday management
│   ├── dashboard.js       # Employee dashboard
│   └── admin-api.js       # Admin API endpoints
├── utils/                  # Utility functions
│   ├── dateUtils.js       # Date formatting and calculations
│   ├── messageUtils.js    # Flash message handling
│   └── auth0Utils.js      # Auth0 Management API utilities
├── views/                  # EJS templates
│   ├── layouts/           # Layout templates
│   │   └── main.ejs       # Main layout wrapper
│   ├── partials/          # Reusable components
│   │   └── notification-script.ejs
│   ├── admin/             # Admin panel views
│   ├── dashboard/         # Dashboard views
│   ├── holidays/          # Holiday management views
│   └── work-hours/        # Work hours views
├── public/                 # Static assets
│   ├── css/               # Compiled CSS
│   ├── images/            # Images and icons
│   └── js/                # Client-side JavaScript
├── src/                    # Source files
│   └── input.css          # Tailwind CSS input file
├── scripts/                # Utility scripts
│   ├── import-public-holidays.js
│   ├── import-working-hours.js
│   └── generate-project-structure.js
├── index.js               # Main application entry point
├── package.json           # Dependencies and scripts
├── tailwind.config.js     # Tailwind configuration
└── .env                   # Environment variables (not in repo)
```

### Key Components Explained

#### Models (`/models`)

- **User.js**: Manages user data, Auth0 synchronization, and role-based permissions
- **WorkHours.js**: Handles work time entries with validation and calculations
- **Holiday.js**: Manages employee vacation days and time off
- **PublicHoliday.js**: System-wide holidays that affect all employees
- **Group.js**: Organizational units for grouping employees

#### Routes (`/routes`)

- **work-hours.js**: Endpoints for logging, editing, and viewing work hours
- **holidays.js**: Holiday request and management endpoints
- **dashboard.js**: Aggregated view of all employees' data
- **admin-api.js**: Administrative functions and Auth0 sync

#### Utilities (`/utils`)

- **dateUtils.js**: Consistent date formatting across the application
- **messageUtils.js**: Standardized notification system
- **auth0Utils.js**: Auth0 Management API integration

## Database Schema

### Tables

#### users

- `id` (SERIAL PRIMARY KEY)
- `auth0_id` (TEXT UNIQUE)
- `email` (TEXT UNIQUE)
- `name` (TEXT)
- `role` (TEXT) - 'admin', 'manager', or 'user'
- `group_id` (INTEGER REFERENCES groups)
- `is_blocked` (BOOLEAN)
- `created_at` (TIMESTAMP)
- `last_login` (TIMESTAMP)

#### work_hours

- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER REFERENCES users)
- `work_date` (DATE)
- `total_hours` (REAL)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

#### holidays

- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER REFERENCES users)
- `holiday_date` (DATE)
- `created_at` (TIMESTAMP)
- UNIQUE(user_id, holiday_date)

#### public_holidays

- `id` (SERIAL PRIMARY KEY)
- `name` (TEXT)
- `holiday_date` (DATE UNIQUE)
- `created_at` (TIMESTAMP)

#### groups

- `id` (SERIAL PRIMARY KEY)
- `name` (TEXT UNIQUE)
- `created_at` (TIMESTAMP)

## Authentication

The application uses Auth0 for authentication with three role levels:

### User Roles

1. **User**: Basic access to personal time tracking and holidays
2. **Manager**: Access to dashboards and statistics for all employees
3. **Admin**: Full system access including user management and configuration

### Protected Routes

- All routes under `/work-hours`, `/holidays` require authentication
- `/admin` routes require admin role
- `/dashboard` and `/work-hours/statistics` require manager or admin role

## Adding New Features

### Step-by-Step Guide

#### 1. Plan the Feature

- Define the data model requirements
- Identify necessary routes and views
- Determine permission levels needed

#### 2. Database Updates

If your feature requires database changes:

```javascript
// Add to db/pg-schema.js
await pool.query(`
  CREATE TABLE IF NOT EXISTS your_table (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    // ... other fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Add indexes if needed
await pool.query(
  `CREATE INDEX IF NOT EXISTS idx_your_table_user_id ON your_table(user_id)`
);
```

#### 3. Create the Model

Create a new model in `/models/YourModel.js`:

```javascript
/**
 * YourModel description
 * Explain the purpose and main functionality
 */
const { dbAsync } = require("../db/database");

class YourModel {
  constructor(data) {
    this.id = data.id;
    // ... other properties
  }

  // Find by ID
  static async findById(id) {
    try {
      const result = await dbAsync.get(
        "SELECT * FROM your_table WHERE id = $1",
        [id]
      );
      return result ? new YourModel(result) : null;
    } catch (error) {
      console.error("Error finding by ID:", error);
      throw error;
    }
  }

  // Create new record
  static async create(data) {
    try {
      const result = await dbAsync.run(
        "INSERT INTO your_table (field1, field2) VALUES ($1, $2) RETURNING id",
        [data.field1, data.field2]
      );

      const newId = result.rows[0].id;
      return await YourModel.findById(newId);
    } catch (error) {
      console.error("Error creating record:", error);
      throw error;
    }
  }

  // Update record
  async update(updateData) {
    try {
      const result = await dbAsync.run(
        "UPDATE your_table SET field1 = $1 WHERE id = $2",
        [updateData.field1, this.id]
      );

      return result.rowCount > 0;
    } catch (error) {
      console.error("Error updating record:", error);
      throw error;
    }
  }

  // Delete record
  async delete() {
    try {
      const result = await dbAsync.run("DELETE FROM your_table WHERE id = $1", [
        this.id,
      ]);
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error deleting record:", error);
      throw error;
    }
  }
}

module.exports = YourModel;
```

#### 4. Create Routes

Create a new route file in `/routes/your-feature.js`:

```javascript
/**
 * Routes for your feature
 * Describe what these routes handle
 */
const express = require("express");
const router = express.Router();
const YourModel = require("../models/YourModel");
const { prepareMessages } = require("../utils/messageUtils");

// List view
router.get("/", async (req, res) => {
  try {
    const items = await YourModel.findAll();

    res.render("your-feature/index", {
      title: "Your Feature",
      currentPage: "your-feature",
      items,
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user,
      messages: prepareMessages(req.query),
    });
  } catch (error) {
    console.error("Error loading items:", error);
    res.status(500).render("error", {
      title: "Error",
      message: "Failed to load items",
      error: error,
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
    });
  }
});

// Create item
router.post("/", async (req, res) => {
  try {
    const { field1, field2 } = req.body;

    // Validation
    if (!field1) {
      return res.redirect("/your-feature?error=invalid_input");
    }

    await YourModel.create({
      field1,
      field2,
      user_id: req.user.id,
    });

    res.redirect("/your-feature?success=created");
  } catch (error) {
    console.error("Error creating item:", error);
    res.redirect("/your-feature?error=failed");
  }
});

// Update item
router.post("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const item = await YourModel.findById(id);

    if (!item) {
      return res.redirect("/your-feature?error=not_found");
    }

    await item.update(req.body);
    res.redirect("/your-feature?success=updated");
  } catch (error) {
    console.error("Error updating item:", error);
    res.redirect("/your-feature?error=failed");
  }
});

// Delete item
router.post("/:id/delete", async (req, res) => {
  try {
    const { id } = req.params;
    const item = await YourModel.findById(id);

    if (!item) {
      return res.redirect("/your-feature?error=not_found");
    }

    await item.delete();
    res.redirect("/your-feature?success=deleted");
  } catch (error) {
    console.error("Error deleting item:", error);
    res.redirect("/your-feature?error=failed");
  }
});

module.exports = router;
```

#### 5. Create Views

Create view files in `/views/your-feature/`:

`index.ejs`:

```html
<%- layout('layouts/main') %>

<div class="bg-white rounded-lg shadow p-6">
  <div class="flex justify-between items-center mb-6">
    <h2 class="text-2xl font-bold text-gray-900">Your Feature Title</h2>
  </div>

  <!-- Add form -->
  <div class="mb-8">
    <form action="/your-feature" method="POST" class="space-y-4">
      <div>
        <label for="field1" class="block text-sm font-medium text-gray-700">
          Field Label
        </label>
        <input
          type="text"
          id="field1"
          name="field1"
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-1.5"
          required />
      </div>

      <button
        type="submit"
        class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-500 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
        Add Item
      </button>
    </form>
  </div>

  <!-- List items -->
  <div class="overflow-x-auto">
    <% if (items && items.length > 0) { %>
    <table class="min-w-full divide-y divide-gray-200">
      <thead class="bg-gray-50">
        <tr>
          <th
            scope="col"
            class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Field 1
          </th>
          <th
            scope="col"
            class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
            Actions
          </th>
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
        <% items.forEach(item => { %>
        <tr>
          <td
            class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
            <%= item.field1 %>
          </td>
          <td
            class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
            <form
              action="/your-feature/<%= item.id %>/delete"
              method="POST"
              class="inline">
              <button type="submit" class="text-red-600 hover:text-red-800">
                Delete
              </button>
            </form>
          </td>
        </tr>
        <% }); %>
      </tbody>
    </table>
    <% } else { %>
    <p class="text-gray-500">No items found.</p>
    <% } %>
  </div>
</div>
```

#### 6. Register Routes

Add to `index.js`:

```javascript
// Import route
const yourFeatureRoutes = require("./routes/your-feature");

// Register route with authentication
app.use("/your-feature", requireAuth, yourFeatureRoutes);
```

#### 7. Add Navigation

Update `/views/layouts/main.ejs` to add navigation link:

```html
<a
  href="/your-feature"
  class="<%- currentPage === 'your-feature' ? 'border-blue-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700' %> inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
  Your Feature
</a>
```

#### 8. Add Messages

Update `/utils/messageUtils.js` with new messages:

```javascript
const messageMap = {
  success: {
    // ... existing messages
    your_feature_created: "Item created successfully.",
    your_feature_updated: "Item updated successfully.",
    your_feature_deleted: "Item deleted successfully.",
  },
  error: {
    // ... existing messages
    your_feature_not_found: "Item not found.",
    your_feature_invalid: "Invalid input provided.",
  },
};
```

#### 9. Update Documentation

- Update `.cursorrules` with new file structure
- Add feature description to this README
- Document any new environment variables

### Feature Development Checklist

- [ ] Database schema updated (if needed)
- [ ] Model created with proper error handling
- [ ] Routes implemented with validation
- [ ] Views created with responsive design
- [ ] Navigation links added
- [ ] Messages added to messageUtils
- [ ] Authentication/authorization configured
- [ ] Routes registered in index.js
- [ ] Documentation updated
- [ ] Tested on local environment

## API Endpoints

### Work Hours

- `GET /work-hours` - View work hours dashboard
- `POST /work-hours` - Add new work hours entry
- `POST /work-hours/:id` - Update work hours entry
- `POST /work-hours/:id/delete` - Delete work hours entry
- `GET /work-hours/statistics` - View statistics (manager/admin)

### Holidays

- `GET /holidays` - View current month holidays
- `POST /holidays` - Add holiday
- `POST /holidays/:id/delete` - Delete holiday
- `GET /holidays/history` - View past holidays
- `GET /holidays/future` - View future holidays
- `GET /holidays/employees` - View all employees' holidays

### Admin API

- `POST /admin-api/sync-users` - Sync users from Auth0
- `POST /admin-api/users/:id/toggle-block` - Block/unblock user
- `POST /admin-api/users/:id/update-name` - Update user name

### Groups (Admin)

- `GET /admin/groups` - List groups
- `POST /admin/groups` - Create group
- `POST /admin/groups/:id` - Update group
- `POST /admin/groups/:id/delete` - Delete group
- `POST /admin/groups/assign-user` - Assign user to group

### Public Holidays (Admin)

- `GET /admin/public-holidays` - List public holidays
- `POST /admin/public-holidays` - Add public holiday
- `POST /admin/public-holidays/:id/delete` - Delete public holiday

## Development Guidelines

### Code Style

1. **File Headers**: Add descriptive comments at the top of each file (except .ejs files)
2. **Comments**: Explain complex logic and business rules
3. **Error Handling**: Always wrap database operations in try-catch blocks
4. **Async/Await**: Use async/await instead of callbacks
5. **Validation**: Validate user input before database operations

### Database Operations

1. Use parameterized queries to prevent SQL injection
2. Use transactions for operations that modify multiple tables
3. Always handle errors and provide meaningful error messages
4. Use the `dbAsync` wrapper for all database operations

### Date Handling

Always use the dateUtils functions:

- `formatDate()` - For database operations (YYYY-MM-DD)
- `formatDateForDisplay()` - For user-facing dates
- `formatDateTimeForDisplay()` - For timestamps with time
- `getWeekdaysInMonth()` - Calculate working days

### Messages and Notifications

1. Use the message utility system for all user notifications
2. Add new messages to `messageUtils.js`
3. Use query parameters for success/error messages
4. Display notifications using the `notification-script` partial

### Security Best Practices

1. Always validate and sanitize user input
2. Use prepared statements for database queries
3. Check user permissions before allowing actions
4. Never expose sensitive data in error messages
5. Keep Auth0 credentials secure in environment variables

## Common Tasks

### Adding a New User Role

1. Update the role check in `models/User.js`
2. Add role-specific middleware in `index.js`
3. Update UI elements to show/hide based on role
4. Add role to the admin panel display

### Modifying Database Schema

1. Update `db/pg-schema.js` with new tables/columns
2. Run `node db/pg-schema.js` to apply changes
3. Update relevant models
4. Test migration on development database first

### Adding New Message Types

1. Add message to `messageUtils.js`
2. Use in routes: `res.redirect('/path?success=message_key')`
3. Messages are automatically displayed via notification system

### Debugging Database Issues

1. Check PostgreSQL logs
2. Enable query logging in `database.js`
3. Use `console.error` in catch blocks
4. Check for connection pool exhaustion
