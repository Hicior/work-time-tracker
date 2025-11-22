const crypto = require("crypto");

// Name for the signed CSRF cookie
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || "csrfToken";

// Generate a strong random token
function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

// Middleware: attach/set CSRF token for safe methods and views
function setCsrfToken(req, res, next) {
  // Only rotate/provide token on idempotent methods
  const method = req.method.toUpperCase();
  const isSafe = method === "GET" || method === "HEAD" || method === "OPTIONS";

  let token = req.signedCookies && req.signedCookies[CSRF_COOKIE_NAME];

  if (!token && isSafe) {
    token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      signed: true,
      path: "/",
    });
  }

  // Expose token to templates via res.locals (never from cookie on unsafe methods)
  if (token && isSafe) {
    res.locals.csrfToken = token;
  }

  next();
}

// Optional defense in depth: verify Origin/Host for unsafe methods
function sameOrigin(req) {
  const origin = req.get("origin");
  const host = req.get("host");
  const referer = req.get("referer");

  // Treat 'null' origin (common for form posts) as no origin
  if (!origin || origin === "null") {
    // If no origin header or origin is 'null', check referer as fallback
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        return refererUrl.host === host;
      } catch (e) {
        return false;
      }
    }
    // Some clients omit Origin on form posts - accept if no referer either
    return true;
  }

  try {
    const u = new URL(origin);
    return u.host === host;
  } catch (e) {
    return false;
  }
}

// Middleware: verify CSRF token for unsafe methods
function verifyCsrf(req, res, next) {
  const method = req.method.toUpperCase();
  const unsafe =
    method === "POST" ||
    method === "PUT" ||
    method === "PATCH" ||
    method === "DELETE";
  if (!unsafe) return next();

  // Allowlist public OIDC callback/logout if they ever become unsafe (they are GET today)
  const path = req.path || "";
  if (
    path.startsWith("/callback") ||
    path.startsWith("/login") ||
    path.startsWith("/logout")
  ) {
    return next();
  }

  const cookieToken = req.signedCookies && req.signedCookies[CSRF_COOKIE_NAME];
  const headerToken = req.get("CSRF-Token") || req.get("X-CSRF-Token");
  const bodyToken = req.body && (req.body._csrf || req.body.csrfToken);
  const token = headerToken || bodyToken;

  if (!cookieToken || !token || token !== cookieToken || !sameOrigin(req)) {
    const err = new Error("Invalid CSRF token");
    err.code = "EBADCSRFTOKEN";
    return next(err);
  }

  next();
}

// Centralized error handler for CSRF errors
function csrfErrorHandler(err, req, res, next) {
  if (err && err.code === "EBADCSRFTOKEN") {
    console.warn("CSRF validation failed", {
      path: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.user && req.user.id,
    });
    const isDevelopment = process.env.NODE_ENV !== "production";
    return res.status(403).render("error", {
      title: "Błąd bezpieczeństwa",
      message:
        "Nieprawidłowy token bezpieczeństwa. Odśwież stronę i spróbuj ponownie.",
      isAuthenticated: req.oidc && req.oidc.isAuthenticated(),
      user: req.oidc && req.oidc.user,
      error: isDevelopment ? err : null,
    });
  }
  next(err);
}

module.exports = {
  setCsrfToken,
  verifyCsrf,
  csrfErrorHandler,
};
