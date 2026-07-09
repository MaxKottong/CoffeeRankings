const express = require("express");
const { body, validationResult } = require("express-validator");

const Place = require("../models/Place");

const router = express.Router();

// Shared validation rules for creating/editing a place (rating allows decimals)
const placeValidators = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Please enter the name of the place.")
    .isLength({ max: 120 })
    .withMessage("Name must be 120 characters or fewer."),
  body("location")
    .trim()
    .isLength({ max: 160 })
    .withMessage("Location must be 160 characters or fewer."),
  body("rating")
    .notEmpty()
    .withMessage("Please enter a rating.")
    .bail()
    .isFloat({ min: 0, max: 10 })
    .withMessage("Rating must be a number between 0 and 10."),
  body("notes")
    .trim()
    .isLength({ max: 500 })
    .withMessage("Notes must be 500 characters or fewer."),
];

// Home page — list all coffee places, highest rated first
router.get("/", async (req, res, next) => {
  try {
    const places = await Place.find().sort({ rating: -1, name: 1 }).lean();
    res.render("index", {
      title: "Coffee Rankings",
      places,
      editingId: null,
      editErrors: [],
      editValues: null,
    });
  } catch (err) {
    next(err);
  }
});

// Submission form
router.get("/submit", (req, res) => {
  res.render("submit", {
    title: "Submit a Coffee Place",
    errors: [],
    values: { name: "", location: "", rating: "", notes: "" },
  });
});

// Handle form submission
router.post(
  "/submit",
  placeValidators,
  async (req, res, next) => {
    const errors = validationResult(req);
    const values = {
      name: req.body.name || "",
      location: req.body.location || "",
      rating: req.body.rating || "",
      notes: req.body.notes || "",
    };

    if (!errors.isEmpty()) {
      return res.status(400).render("submit", {
        title: "Submit a Coffee Place",
        errors: errors.array(),
        values,
      });
    }

    try {
      await Place.create({
        name: values.name,
        location: values.location,
        rating: Number(values.rating),
        notes: values.notes,
      });
      res.redirect("/");
    } catch (err) {
      next(err);
    }
  }
);

// Update a place (inline edit from the rankings list)
router.put("/places/:id", placeValidators, async (req, res, next) => {
  const errors = validationResult(req);
  const values = {
    name: req.body.name || "",
    location: req.body.location || "",
    rating: req.body.rating || "",
    notes: req.body.notes || "",
  };

  try {
    if (!errors.isEmpty()) {
      const places = await Place.find().sort({ rating: -1, name: 1 }).lean();
      return res.status(400).render("index", {
        title: "Coffee Rankings",
        places,
        editingId: req.params.id,
        editErrors: errors.array(),
        editValues: values,
      });
    }

    await Place.findByIdAndUpdate(
      req.params.id,
      {
        name: values.name,
        location: values.location,
        rating: Number(values.rating),
        notes: values.notes,
      },
      { runValidators: true }
    );
    res.redirect("/");
  } catch (err) {
    next(err);
  }
});

// Delete a place
router.delete("/places/:id", async (req, res, next) => {
  try {
    await Place.findByIdAndDelete(req.params.id);
    res.redirect("/");
  } catch (err) {
    next(err);
  }
});

module.exports = router;
