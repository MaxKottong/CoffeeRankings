const express = require("express");
const bcrypt = require("bcryptjs");

const User = require("../models/User");

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

// Signup form
router.get("/signup", (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect("/");
  }
  res.render("signup", {
    title: "Sign Up",
    error: null,
    values: { name: "", email: "" },
  });
});

// Handle login
router.post("/login", async (req, res, next) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  try {
    const user = await User.findOne({ email }).lean();
    if (!user) {
      return res.status(401).render("login", {
        title: "Log In",
        error: "Invalid email or password.",
        values: { email },
      });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).render("login", {
        title: "Log In",
        error: "Invalid email or password.",
        values: { email },
      });
    }

    req.session.user = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      isAdmin: !!user.isAdmin,
    };
    res.redirect("/");
  } catch (err) {
    next(err);
  }
});

// Handle signup
router.post("/signup", async (req, res, next) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  const errors = [];
  if (!name) errors.push("Please enter your name.");
  if (!email) errors.push("Please enter your email.");
  if (!password) errors.push("Please enter a password.");
  if (password.length < 8) errors.push("Password must be at least 8 characters.");
  if (password !== confirmPassword) errors.push("Passwords do not match.");

  if (errors.length) {
    return res.status(400).render("signup", {
      title: "Sign Up",
      error: errors.join(" "),
      values: { name, email },
    });
  }

  try {
    const existing = await User.findOne({ email }).lean();
    if (existing) {
      return res.status(409).render("signup", {
        title: "Sign Up",
        error: "An account with that email already exists.",
        values: { name, email },
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await User.create({
      name,
      email,
      passwordHash,
      isAdmin: false,
    });

    req.session.user = {
      id: String(created._id),
      email: created.email,
      name: created.name,
      isAdmin: false,
    };
    res.redirect("/");
  } catch (err) {
    next(err);
  }
});

// Handle logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

module.exports = router;
