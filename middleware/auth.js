// Blocks access to protected routes when no user is logged in.
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect("/login");
}

// Exposes the current user to all views via res.locals.user.
function currentUser(req, res, next) {
  res.locals.user = (req.session && req.session.user) || null;
  next();
}

module.exports = { requireAuth, currentUser };
