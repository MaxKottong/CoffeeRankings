require("dotenv").config();

const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const methodOverride = require("method-override");

const placesRouter = require("./routes/places");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/coffee_ratings";

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

// Routes
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
  .then(() => {
    console.log("Connected to MongoDB.");
    app.listen(PORT, () => {
      console.log(`Coffee Ratings running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
