const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");

const User = require("../models/User");
const Place = require("../models/Place");
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

function makeSyntheticEmail(username) {
  return `${username}@users.local`;
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

function reviewBelongsToUser(review, user) {
  const reviewUserId = String(review.accountUserId || "");
  const userId = String(user._id || user.id || "");
  const reviewUsername = String(review.accountUsername || "").toLowerCase();
  const username = String(user.username || "").toLowerCase();
  const reviewEmail = String(review.accountEmail || "").toLowerCase();
  const email = String(user.email || "").toLowerCase();

  return (
    (reviewUserId && userId && reviewUserId === userId) ||
    (reviewUsername && username && reviewUsername === username) ||
    (reviewEmail && email && reviewEmail === email)
  );
}

async function getRecentCommunityReviewsForUser(user) {
  const places = await Place.find({
    $or: [
      { "communityReviews.accountUserId": user._id || user.id },
      { "communityReviews.accountUsername": user.username },
      { "communityReviews.accountEmail": user.email },
    ],
  })
    .select("name communityReviews")
    .lean();

  const recent = [];
  places.forEach((place) => {
    (place.communityReviews || []).forEach((review) => {
      if (!reviewBelongsToUser(review, user)) {
        return;
      }
      recent.push({
        placeName: place.name,
        overallRating: ratingFromCommunityReview(review),
        createdAt: review.createdAt,
      });
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
    values: { username: "", location: "" },
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
  const location = String(req.body.location || "").trim();
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  const errors = [];
  if (!username) errors.push("Please enter a username.");
  if (username.length > 40) errors.push("Username must be 40 characters or fewer.");
  if (!/^[a-z0-9._-]+$/.test(username)) {
    errors.push("Username can only contain letters, numbers, dot, underscore, and hyphen.");
  }
  if (!location) errors.push("Please enter a location.");
  if (location.length > 120) errors.push("Location must be 120 characters or fewer.");
  if (!password) errors.push("Please enter a password.");
  if (password.length < 8) errors.push("Password must be at least 8 characters.");
  if (password !== confirmPassword) errors.push("Passwords do not match.");

  if (errors.length) {
    return res.status(400).render("signup", {
      title: "Sign Up",
      error: errors.join(" "),
      values: { username, location },
    });
  }

  try {
    const existing = await User.findOne({ username }).lean();
    if (existing) {
      return res.status(409).render("signup", {
        title: "Sign Up",
        error: "That username is already taken.",
        values: { username, location },
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await User.create({
      username,
      name: username,
      email: makeSyntheticEmail(username),
      location,
      passwordHash,
      isAdmin: false,
      topCoffees: [],
      wantToTry: [],
    });

    req.session.user = toSessionUser(created);
    res.redirect("/profile");
  } catch (err) {
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
    res.set("Cache-Control", "public, max-age=604800");
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
      };

      res.redirect("/profile");
    } catch (err) {
      next(err);
    }
  });
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
