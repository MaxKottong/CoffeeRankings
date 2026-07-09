const express = require("express");

const { verifyUser } = require("../lib/users");

const router = express.Router();

// Login form
router.get("/login", (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect("/");
  }
  res.render("login", {
    title: "Log In",
    error: null,
    values: { email: "" },
  });
});

// Handle login
router.post("/login", (req, res) => {
  const email = req.body.email || "";
  const password = req.body.password || "";
  const user = verifyUser(email, password);

  if (!user) {
    return res.status(401).render("login", {
      title: "Log In",
      error: "Invalid email or password.",
      values: { email },
    });
  }

  req.session.user = user;
  res.redirect("/");
});

// Handle logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

module.exports = router;
