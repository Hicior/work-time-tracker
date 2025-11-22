/**
 * Main application server file for the Work Time Tracker application.
 * Sets up Express, configures middleware, initializes database connection,
 * establishes Auth0 authentication, and defines routes for the application.
 * Handles user authentication, admin functionality, and server initialization.
 */
const express = require("express");
const path = require("path");
const ejsMate = require("ejs-mate");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const { auth } = require("express-openid-connect");
const { authLimiter, apiLimiter } = require("./utils/rateLimiter");
require("dotenv").config();

// Validate environment variables before starting the application
const { validateEnvironmentVariables } = require("./utils/envValidator");
validateEnvironmentVariables();

const app = express();

// Trust proxy - required for Auth0 to work correctly behind Render's proxy
// This allows Express to properly detect HTTPS via X-Forwarded-Proto header
app.set('trust proxy', 1);

// Security headers middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Required for Tailwind CSS
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"], // Required for Auth0
      fontSrc: ["'self'", "data:"],
    },
  },
}));

// Rate limiting middleware - protect auth and API endpoints from abuse
app.use('/login', authLimiter);
app.use('/callback', authLimiter);
app.use('/admin-api', apiLimiter);

const PORT = process.env.PORT || 3000;
const User = require("./models/User");
const Group = require("./models/Group");
const WorkHours = require("./models/WorkHours");
const { prepareMessages } = require("./utils/messageUtils");

// Auth0 configuration
const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_SECRET,
  baseURL: process.env.AUTH0_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
};

// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(auth(config));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Parse signed cookies for CSRF double-submit cookie pattern
app.use(cookieParser(process.env.CSRF_COOKIE_SECRET || process.env.AUTH0_SECRET));
app.use(express.static(path.join(__dirname, "public")));

// Set view engine
app.engine("ejs", ejsMate);
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Import routes
const workHoursRoutes = require("./routes/work-hours");
const holidaysRoutes = require("./routes/holidays");
const groupsRoutes = require("./routes/groups");
const publicHolidaysRoutes = require("./routes/public-holidays");
const dashboardRoutes = require("./routes/dashboard");
const adminApiRoutes = require("./routes/admin-api");

// CSRF protection
const { setCsrfToken, verifyCsrf, csrfErrorHandler } = require("./utils/csrf");
// Expose token on safe methods for views
app.use(setCsrfToken);
// Verify token for all unsafe methods globally
app.use(verifyCsrf);

// Auth middleware
const requireAuth = async (req, res, next) => {
  if (!req.oidc.isAuthenticated()) {
    return res.redirect("/login");
  }

  try {
    // Get or create user in our database
    const user = await User.createFromAuth0(req.oidc.user);

    // Check if user is blocked
    if (user.is_blocked) {
      console.warn(`Blocked user attempted access: ${user.email} (${user.auth0_id})`);
      // Log out the user and redirect to blocked page
      req.logout();
      return res.render("blocked", {
        title: "Konto Zablokowane",
        isAuthenticated: false,
        user: null,
      });
    }

    // Add user to the request object
    req.user = user;
    next();
  } catch (error) {
    console.error("Error processing authenticated user:", error);
    return res.status(500).render("error", {
      title: "Error",
      message: "Failed to process user authentication",
      error: error,
      isAuthenticated: true,
      user: req.oidc.user,
    });
  }
};

// Admin role check middleware
const requireAdmin = async (req, res, next) => {
  if (!req.user || req.user.is_blocked || !req.user.isAdmin()) {
    return res.status(403).render("error", {
      title: "Dostęp zabroniony",
      message: "Ta sekcja wymaga uprawnień administratora",
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
    });
  }
  next();
};

// Manager role check middleware
const requireManager = async (req, res, next) => {
  if (!req.user || req.user.is_blocked || !req.user.hasElevatedPermissions()) {
    return res.status(403).render("error", {
      title: "Dostęp zabroniony",
      message: "Ta sekcja wymaga uprawnień menedżera lub administratora",
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
    });
  }
  next();
};

// Routes
app.get("/", async (req, res) => {
  let dbUser = null;
  let monthStats = null;
  let publicHolidaysOnWorkdays = [];

  // If user is authenticated, get dbUser and month statistics
  if (req.oidc.isAuthenticated()) {
    try {
      dbUser = await User.createFromAuth0(req.oidc.user);

      // Get current month and year
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1; // JavaScript months are 0-indexed

      // Fetch data for stats
      const { getWeekdaysInMonth } = require("./utils/dateUtils");
      const Holiday = require("./models/Holiday");
      const PublicHoliday = require("./models/PublicHoliday");

      // Get total work hours for the month
      const totalWorkHours = await WorkHours.getTotalMonthlyHours(
        dbUser.id,
        currentYear,
        currentMonth
      );

      // Get holiday count for the month
      const holidayCount = await Holiday.getTotalMonthlyHolidays(
        dbUser.id,
        currentYear,
        currentMonth
      );

      // Get public holidays for the month
      const publicHolidays = await PublicHoliday.findByMonthAndYear(
        currentMonth,
        currentYear
      );

      // Filter public holidays that fall on weekdays
      publicHolidaysOnWorkdays = publicHolidays.filter((holiday) => {
        const date = new Date(holiday.holiday_date);
        const dayOfWeek = date.getDay();
        return dayOfWeek !== 0 && dayOfWeek !== 6; // 0 = Sunday, 6 = Saturday
      });

      // Calculate stats
      const hoursPerDay = 8;
      const workDaysInMonth = getWeekdaysInMonth(currentYear, currentMonth);
      // Subtract all public holidays from required monthly hours
      const requiredMonthlyHours =
        (workDaysInMonth - publicHolidays.length) * hoursPerDay;

      const totalHolidayHours = holidayCount * hoursPerDay;
      const publicHolidayHours = publicHolidaysOnWorkdays.length * hoursPerDay;
      // Don't include public holidays in total combined hours
      const totalCombinedHours = totalWorkHours + totalHolidayHours;

      const remainingHours = Math.max(
        0,
        requiredMonthlyHours - totalCombinedHours
      );

      // Prepare stats object
      monthStats = {
        totalWorkHours: Math.round(totalWorkHours * 100) / 100,
        holidayCount,
        totalHolidayHours,
        publicHolidaysCount: publicHolidaysOnWorkdays.length,
        publicHolidayHours,
        totalCombinedHours: Math.round(totalCombinedHours * 100) / 100,
        requiredMonthlyHours,
        remainingHours: Math.round(remainingHours * 100) / 100,
      };
    } catch (error) {
      console.error("Error getting user data for homepage:", error);
      // Provide fallback monthStats to prevent template crashes
      monthStats = {
        totalWorkHours: 0,
        holidayCount: 0,
        totalHolidayHours: 0,
        publicHolidaysCount: 0,
        publicHolidayHours: 0,
        totalCombinedHours: 0,
        requiredMonthlyHours: 0,
        remainingHours: 0,
      };
    }
  }

  res.render("index", {
    title: "Strona główna",
    currentPage: "home",
    isAuthenticated: req.oidc.isAuthenticated(),
    user: req.oidc.user,
    dbUser: dbUser,
    monthStats: monthStats,
    publicHolidaysOnWorkdays: publicHolidaysOnWorkdays,
  });
});

app.get("/profile", requireAuth, (req, res) => {
  res.render("profile", {
    title: "Profil",
    currentPage: "profile",
    isAuthenticated: req.oidc.isAuthenticated(),
    user: req.oidc.user,
    dbUser: req.user,
  });
});

// Admin dashboard route
app.get("/admin", requireAuth, requireManager, async (req, res) => {
  try {
    const users = await User.getAll();
    const groups = await Group.findAll();

    res.render("admin/index", {
      title: "Panel Administratora",
      currentPage: "admin",
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
      dbUser: req.user,
      users: users,
      groups: groups,
      messages: prepareMessages(req.query),
    });
  } catch (error) {
    console.error("Error loading admin dashboard:", error);
    res.status(500).render("error", {
      title: "Błąd",
      message: "Nie udało się załadować panelu administratora",
      error: error,
      isAuthenticated: req.oidc.isAuthenticated(),
      user: req.oidc.user,
    });
  }
});

// Admin route to update user role
app.post(
  "/admin/users/:id/role",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!role || !["admin", "user", "manager"].includes(role)) {
        return res.status(400).send("Invalid role specified");
      }

      await User.setRole(id, role);

      // Add specific message based on the new role
      let successMessage = "role_updated";
      if (role === "admin") {
        successMessage = "role_changed_to_admin";
      } else if (role === "manager") {
        successMessage = "role_changed_to_manager";
      } else if (role === "user") {
        successMessage = "role_changed_to_user";
      }

      res.redirect(`/admin?success=${successMessage}`);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).render("error", {
        title: "Błąd",
        message: "Nie udało się zaktualizować roli użytkownika",
        error: error,
        isAuthenticated: req.oidc.isAuthenticated(),
        user: req.oidc.user,
      });
    }
  }
);

// Register routes
app.use("/dashboard", requireAuth, requireManager, dashboardRoutes);
app.use("/work-hours", requireAuth, workHoursRoutes);
app.use("/holidays", requireAuth, holidaysRoutes);
app.use("/admin/groups", requireAuth, requireAdmin, groupsRoutes);
app.use(
  "/admin/public-holidays",
  requireAuth,
  requireAdmin,
  publicHolidaysRoutes
);
app.use("/admin-api", requireAuth, requireManager, adminApiRoutes);

// CSRF error handler must be after routes
app.use(csrfErrorHandler);

// Global error handler middleware - catches all unhandled errors
app.use((err, req, res, next) => {
  // Log error for monitoring
  console.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // Determine if we should expose error details (only in development)
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  // Get HTTP status code from error or default to 500
  const statusCode = err.status || err.statusCode || 500;

  // Safely check authentication state
  const isAuthenticated = req.oidc && req.oidc.isAuthenticated();
  const user = req.oidc && req.oidc.user ? req.oidc.user : null;

  // Render error page with sanitized error data
  res.status(statusCode).render('error', {
    title: 'Błąd',
    message: 'Wystąpił błąd podczas przetwarzania żądania.',
    error: isDevelopment ? err : null, // Only expose error details in development
    isAuthenticated: isAuthenticated,
    user: user,
  });
});

// Create work-hours directory if it doesn't exist
const fs = require("fs");
const workHoursDir = path.join(__dirname, "views", "work-hours");
if (!fs.existsSync(workHoursDir)) {
  fs.mkdirSync(workHoursDir, { recursive: true });
}

// Create holidays directory if it doesn't exist
const holidaysDir = path.join(__dirname, "views", "holidays");
if (!fs.existsSync(holidaysDir)) {
  fs.mkdirSync(holidaysDir, { recursive: true });
}

// Create dashboard directory if it doesn't exist
const dashboardDir = path.join(__dirname, "views", "dashboard");
if (!fs.existsSync(dashboardDir)) {
  fs.mkdirSync(dashboardDir, { recursive: true });
}

// Initialize database schema
const initializeDb = async () => {
  try {
    const { createSchema } = require("./db/pg-schema");
    await createSchema();
    console.log("PostgreSQL database schema initialized");
  } catch (error) {
    console.error("Error initializing PostgreSQL database:", error);
  }
};

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initializeDb();
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} signal received: closing HTTP server`);
  
  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed');
    
    // Close database connection pool
    try {
      const { pool } = require('./db/database');
      await pool.end();
      console.log('Database connection pool closed');
    } catch (error) {
      console.error('Error closing database pool:', error);
    }
    
    console.log('Graceful shutdown completed');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});
