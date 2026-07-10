require("dotenv").config();

const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const methodOverride = require("method-override");
const session = require("express-session");

const placesRouter = require("./routes/places");
const authRouter = require("./routes/auth");
const { currentUser } = require("./middleware/auth");
const User = require("./models/User");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/coffee_ratings";
const SESSION_SECRET =
  process.env.SESSION_SECRET || "coffee-ratings-dev-secret-change-me";
const SHOULD_SYNC_USER_INDEXES =
  String(process.env.SYNC_USER_INDEXES || "").toLowerCase() === "true";

// Run index migrations manually after connect to avoid startup failures
// caused by legacy index option mismatches (for example sparse vs non-sparse).
mongoose.set("autoIndex", false);

function slugifyUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function uniqueUsername(base) {
  const fallback = slugifyUsername(base) || `user-${Date.now()}`;
  let candidate = fallback;
  let i = 1;
  while (await User.findOne({ username: candidate }).lean()) {
    candidate = `${fallback.slice(0, 36)}-${i}`;
    i += 1;
  }
  return candidate;
}

async function ensureUsernames() {
  const users = await User.find({
    $or: [{ username: { $exists: false } }, { username: "" }],
  });

  for (const user of users) {
    const source =
      (user.email && user.email.split("@")[0]) || user.name || String(user._id);
    user.username = await uniqueUsername(source);
    if (!user.location) {
      user.location = "";
    }
    await user.save();
  }
}

async function ensureUserIndexes() {
  const indexes = await User.collection.indexes();
  const legacySparseIndexes = indexes.filter(
    (idx) =>
      idx.sparse &&
      idx.key &&
      ((idx.key.username === 1 && idx.name === "username_1") ||
        (idx.key.email === 1 && idx.name === "email_1"))
  );

  for (const idx of legacySparseIndexes) {
    await User.collection.dropIndex(idx.name);
  }

  try {
    await User.syncIndexes();
  } catch (err) {
    const message = String((err && err.message) || "");
    const isIndexConflict =
      err &&
      (err.codeName === "IndexOptionsConflict" ||
        err.code === 85 ||
        message.includes("An existing index has the same name as the requested index"));

    if (!isIndexConflict) {
      throw err;
    }

    // Some deployments can have the opposite sparse/non-sparse variant with the
    // same auto-generated name. Drop and recreate whichever one conflicts.
    const dropTargets = [];
    if (message.includes('"username_1"')) dropTargets.push("username_1");
    if (message.includes('"email_1"')) dropTargets.push("email_1");
    if (!dropTargets.length) {
      dropTargets.push("username_1", "email_1");
    }

    for (const name of dropTargets) {
      try {
        await User.collection.dropIndex(name);
      } catch (dropErr) {
        const dropMessage = String((dropErr && dropErr.message) || "");
        if (!dropMessage.includes("index not found")) {
          throw dropErr;
        }
      }
    }

    await User.syncIndexes();
  }
}

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    },
  })
);
app.use(currentUser);

// Routes
app.use("/", authRouter);
app.use("/", placesRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).render("error", {
    title: "Not Found",
    message: "The page you are looking for does not exist.",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render("error", {
    title: "Something went wrong",
    message: "An unexpected error occurred. Please try again.",
  });
});

// Connect to MongoDB, then start the server
mongoose
  .connect(MONGODB_URI, { autoIndex: false })
  .then(async () => {
    console.log("Connected to MongoDB.");
    await ensureUsernames();
    if (SHOULD_SYNC_USER_INDEXES) {
      await ensureUserIndexes();
      console.log("User indexes synced.");
    } else {
      console.log("Skipping user index sync (set SYNC_USER_INDEXES=true to enable).");
    }
    app.listen(PORT, () => {
      console.log(`Coffee Ratings running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
