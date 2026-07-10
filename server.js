require("dotenv").config();

const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const methodOverride = require("method-override");
const session = require("express-session");
const bcrypt = require("bcryptjs");

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

const ADMIN_SEED_USERS = [
  {
    email: "max.kottong@gmail.com",
    name: "Max",
    password:
      process.env.MAX_ADMIN_PASSWORD || process.env.MAX_PASSWORD || "C@t@c1y5m1c",
  },
  {
    email: "margaretmclean1@me.com",
    name: "Margo",
    password:
      process.env.MARGO_ADMIN_PASSWORD || process.env.MARGO_PASSWORD || "B!ackd0g123",
  },
];

async function ensureAdminUsers() {
  for (const seed of ADMIN_SEED_USERS) {
    const existing = await User.findOne({ email: seed.email });
    if (existing) {
      if (!existing.isAdmin) {
        existing.isAdmin = true;
        await existing.save();
      }
      continue;
    }

    const passwordHash = await bcrypt.hash(seed.password, 12);
    await User.create({
      name: seed.name,
      email: seed.email,
      passwordHash,
      isAdmin: true,
    });
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
  .connect(MONGODB_URI)
  .then(async () => {
    console.log("Connected to MongoDB.");
    await ensureAdminUsers();
    app.listen(PORT, () => {
      console.log(`Coffee Ratings running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
