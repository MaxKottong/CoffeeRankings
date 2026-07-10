// Blocks access to protected routes when no user is logged in.
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect("/login");
}

// Blocks access to admin-only routes.
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.isAdmin) {
    return next();
  }
  return res.status(403).render("error", {
    title: "Access denied",
    message: "You do not have permission to access this area.",
  });
}

// Exposes the current user to all views via res.locals.user.
function currentUser(req, res, next) {
  res.locals.user = (req.session && req.session.user) || null;
  next();
}

module.exports = { requireAuth, requireAdmin, currentUser };
