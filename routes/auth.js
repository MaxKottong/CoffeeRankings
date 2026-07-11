const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");

const User = require("../models/User");
const Place = require("../models/Place");
const CommunityReview = require("../models/CommunityReview");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const uploadProfileImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      return cb(null, true);
    }
    cb(new Error("Only image files can be uploaded."));
  },
}).single("profileImage");

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeBio(value) {
  return String(value || "")
    .replace(/^\s*about\s*me\s*:\s*/i, "")
    .trim();
}

function toSessionUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    email: user.email,
    name: user.name,
    location: user.location || "",
    isAdmin: !!user.isAdmin,
    isDarkMode: !!user.isDarkMode,
  };
}

function ratingFromCommunityReview(review) {
  return (
    (review.costRating +
      review.tasteRating +
      review.locationRating +
      review.vibeRating) /
    4
  );
}

async function getRecentCommunityReviewsForUser(user) {
  const reviewFilter = {
    $or: [
      { accountUserId: user._id || user.id },
      { accountUsername: String(user.username || "").toLowerCase() },
      { accountEmail: String(user.email || "").toLowerCase() },
    ],
  };

  const collectionReviews = await CommunityReview.find(reviewFilter)
    .select("placeId costRating tasteRating locationRating vibeRating createdAt")
    .lean();

  const placeIds = Array.from(
    new Set(collectionReviews.map((review) => String(review.placeId || "")).filter(Boolean))
  );

  const placesById = new Map();
  if (placeIds.length) {
    const placeDocs = await Place.find({ _id: { $in: placeIds } })
      .select("_id name")
      .lean();
    placeDocs.forEach((place) => placesById.set(String(place._id), place));
  }

  const recent = [];
  collectionReviews.forEach((review) => {
    const place = placesById.get(String(review.placeId || ""));
    if (!place) return;
    recent.push({
      placeName: place.name,
      overallRating: ratingFromCommunityReview(review),
      createdAt: review.createdAt,
    });
  });

  return recent
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 3);
}

// Login form.
router.get("/login", (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect("/");
  }
  res.render("login", {
    title: "Log In",
    error: null,
    values: { username: "" },
  });
});

// Signup form.
router.get("/signup", (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect("/");
  }
  res.render("signup", {
    title: "Sign Up",
    error: null,
    values: { username: "", email: "" },
  });
});

// Handle login.
router.post("/login", async (req, res, next) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || "");

  try {
    const user = await User.findOne({
      $or: [{ username }, { email: username }],
    }).lean();

    if (!user) {
      return res.status(401).render("login", {
        title: "Log In",
        error: "Invalid username or password.",
        values: { username },
      });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).render("login", {
        title: "Log In",
        error: "Invalid username or password.",
        values: { username },
      });
    }

    req.session.user = toSessionUser(user);
    res.redirect("/");
  } catch (err) {
    next(err);
  }
});

// Handle signup.
router.post("/signup", async (req, res, next) => {
  const username = normalizeUsername(req.body.username);
  const email = normalizeEmail(req.body.email);
  const location = String(req.body.location || "").trim();
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  const errors = [];
  if (!username) errors.push("Please enter a username.");
  if (username.length > 40) errors.push("Username must be 40 characters or fewer.");
  if (!/^[a-z0-9._-]+$/.test(username)) {
    errors.push("Username can only contain letters, numbers, dot, underscore, and hyphen.");
  }
  if (!email) errors.push("Please enter an email.");
  if (email.length > 160) errors.push("Email must be 160 characters or fewer.");
  if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push("Please enter a valid email.");
  if (location.length > 120) errors.push("Location must be 120 characters or fewer.");
  if (!password) errors.push("Please enter a password.");
  if (password.length < 8) errors.push("Password must be at least 8 characters.");
  if (password !== confirmPassword) errors.push("Passwords do not match.");

  if (errors.length) {
    return res.status(400).render("signup", {
      title: "Sign Up",
      error: errors.join(" "),
      values: { username, email },
    });
  }

  try {
    const [existingUsername, existingEmail] = await Promise.all([
      User.findOne({ username }).lean(),
      User.findOne({ email }).lean(),
    ]);
    if (existingUsername) {
      return res.status(409).render("signup", {
        title: "Sign Up",
        error: "That username is already taken.",
        values: { username, email },
      });
    }
    if (existingEmail) {
      return res.status(409).render("signup", {
        title: "Sign Up",
        error: "That email is already in use.",
        values: { username, email },
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await User.create({
      username,
      name: username,
      email,
      location,
      passwordHash,
      isAdmin: false,
      isDarkMode: false,
      topCoffees: [],
      wantToTry: [],
    });

    req.session.user = toSessionUser(created);
    res.redirect("/profile");
  } catch (err) {
    if (err && err.code === 11000) {
      const duplicateField = err.keyPattern && (err.keyPattern.username ? "username" : err.keyPattern.email ? "email" : null);
      const message =
        duplicateField === "username"
          ? "That username is already taken."
          : duplicateField === "email"
          ? "That email is already in use."
          : "That username or email is already in use.";

      return res.status(409).render("signup", {
        title: "Sign Up",
        error: message,
        values: { username, email },
      });
    }
    next(err);
  }
});

// Profile page.
router.get("/profile", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.session.user.id).lean();
    if (!user) {
      req.session.destroy(() => {
        res.redirect("/login");
      });
      return;
    }

    const recentReviews = await getRecentCommunityReviewsForUser(user);
    const safeBio = normalizeBio(user.bio) || "I love coffee!";
    res.render("profile", {
      title: "Profile",
      canEdit: true,
      profileUser: {
        ...user,
        bio: safeBio,
      },
      recentReviews,
      error: null,
      values: {
        location: user.location || "",
        bio: safeBio,
        topCoffee1: user.topCoffees && user.topCoffees[0] ? user.topCoffees[0] : "",
        topCoffee2: user.topCoffees && user.topCoffees[1] ? user.topCoffees[1] : "",
        topCoffee3: user.topCoffees && user.topCoffees[2] ? user.topCoffees[2] : "",
        try1: user.wantToTry && user.wantToTry[0] ? user.wantToTry[0] : "",
        try2: user.wantToTry && user.wantToTry[1] ? user.wantToTry[1] : "",
        try3: user.wantToTry && user.wantToTry[2] ? user.wantToTry[2] : "",
      },
    });
  } catch (err) {
    next(err);
  }
});

// Serve profile image.
router.get("/users/:id/profile-image", async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select("profileImage");
    if (!user || !user.profileImage || !user.profileImage.data) {
      return res.status(404).end();
    }
    res.set("Content-Type", user.profileImage.contentType || "image/jpeg");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.send(user.profileImage.data);
  } catch (err) {
    next(err);
  }
});

// Update profile.
router.put("/profile", requireAuth, async (req, res, next) => {
  uploadProfileImage(req, res, async (uploadErr) => {
    const values = {
      location: String(req.body.location || "").trim(),
      bio: normalizeBio(req.body.bio),
      topCoffee1: String(req.body.topCoffee1 || "").trim(),
      topCoffee2: String(req.body.topCoffee2 || "").trim(),
      topCoffee3: String(req.body.topCoffee3 || "").trim(),
      try1: String(req.body.try1 || "").trim(),
      try2: String(req.body.try2 || "").trim(),
      try3: String(req.body.try3 || "").trim(),
    };

    const errors = [];
    if (uploadErr) errors.push(uploadErr.message || "Profile image upload failed.");
    if (!values.location) errors.push("Location is required.");
    if (values.location.length > 120) errors.push("Location must be 120 characters or fewer.");
    if (values.bio.length > 300) errors.push("Bio must be 300 characters or fewer.");

    try {
      const user = await User.findById(req.session.user.id);
      if (!user) {
        return res.status(404).render("error", {
          title: "Not Found",
          message: "Profile not found.",
        });
      }

      if (errors.length) {
        const recentReviews = await getRecentCommunityReviewsForUser(user);
        const currentUser = user.toObject();
        return res.status(400).render("profile", {
          title: "Profile",
          profileUser: {
            ...currentUser,
            bio: normalizeBio(currentUser.bio) || "I love coffee!",
          },
          recentReviews,
          error: errors.join(" "),
          values,
        });
      }

      user.location = values.location;
      user.bio = values.bio || "I love coffee!";
      user.topCoffees = [values.topCoffee1, values.topCoffee2, values.topCoffee3]
        .filter((item) => !!item)
        .slice(0, 3);
      user.wantToTry = [values.try1, values.try2, values.try3]
        .filter((item) => !!item)
        .slice(0, 3);

      if (req.file) {
        user.profileImage = {
          data: req.file.buffer,
          contentType: req.file.mimetype,
        };
      }

      await user.save();
      req.session.user = {
        ...req.session.user,
        location: user.location,
        name: user.name,
        isDarkMode: !!user.isDarkMode,
      };

      res.redirect("/profile");
    } catch (err) {
      next(err);
    }
  });
});

// Persist dark mode preference for signed-in users.
router.put("/profile/theme", requireAuth, async (req, res, next) => {
  const raw = String(req.body.isDarkMode || "")
    .trim()
    .toLowerCase();
  const isDarkMode = raw === "true" || raw === "1" || raw === "on";

  try {
    const user = await User.findById(req.session.user.id);
    if (!user) {
      return res.status(404).json({ error: "Profile not found." });
    }

    user.isDarkMode = isDarkMode;
    await user.save();

    req.session.user = {
      ...req.session.user,
      isDarkMode,
    };

    return res.json({ ok: true, isDarkMode });
  } catch (err) {
    return next(err);
  }
});

// Public profile page by username.
router.get("/users/:username", async (req, res, next) => {
  try {
    const username = normalizeUsername(req.params.username);
    const user = await User.findOne({ username }).lean();
    if (!user) {
      return res.status(404).render("error", {
        title: "Not Found",
        message: "This profile could not be found.",
      });
    }

    const recentReviews = await getRecentCommunityReviewsForUser(user);
    const safeBio = normalizeBio(user.bio) || "I love coffee!";
    res.render("user-profile", {
      title: `@${user.username}`,
      profileUser: {
        ...user,
        bio: safeBio,
      },
      recentReviews,
    });
  } catch (err) {
    next(err);
  }
});

// Handle logout.
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

module.exports = router;
