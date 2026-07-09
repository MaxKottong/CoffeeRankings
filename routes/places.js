const express = require("express");
const { body, validationResult } = require("express-validator");

const Place = require("../models/Place");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const ratingValidator = (field, label) =>
  body(field)
    .notEmpty()
    .withMessage(`Please enter a ${label} rating.`)
    .bail()
    .isFloat({ min: 0, max: 10 })
    .withMessage(`${label} rating must be a number between 0 and 10.`);

// Shared validation rules for creating/editing a place
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
  body("ordered")
    .trim()
    .isLength({ max: 200 })
    .withMessage("What was ordered must be 200 characters or fewer."),
  ratingValidator("costRating", "Cost"),
  ratingValidator("tasteRating", "Taste"),
  ratingValidator("locationRating", "Location"),
  ratingValidator("vibeRating", "Vibe"),
  body("notes")
    .trim()
    .isLength({ max: 500 })
    .withMessage("Notes must be 500 characters or fewer."),
];

// Pull place fields from a submitted form body.
function readValues(body) {
  return {
    name: body.name || "",
    location: body.location || "",
    ordered: body.ordered || "",
    costRating: body.costRating || "",
    tasteRating: body.tasteRating || "",
    locationRating: body.locationRating || "",
    vibeRating: body.vibeRating || "",
    notes: body.notes || "",
  };
}

// Attach a computed overall rating and sort highest first.
function withRankings(places) {
  return places
    .map((place) => {
      // Fall back to the legacy single `rating` (or 0) for older records.
      const fallback = typeof place.rating === "number" ? place.rating : 0;
      const cost =
        typeof place.costRating === "number" ? place.costRating : fallback;
      const taste =
        typeof place.tasteRating === "number" ? place.tasteRating : fallback;
      const location =
        typeof place.locationRating === "number"
          ? place.locationRating
          : fallback;
      const vibe =
        typeof place.vibeRating === "number" ? place.vibeRating : fallback;
      const overall = (cost + taste + location + vibe) / 4;
      return {
        ...place,
        costRating: cost,
        tasteRating: taste,
        locationRating: location,
        vibeRating: vibe,
        ordered: place.ordered || "",
        overallRating: overall,
      };
    })
    .sort(
      (a, b) =>
        b.overallRating - a.overallRating || a.name.localeCompare(b.name)
    );
}

// Home page — list all coffee places, highest rated first
router.get("/", async (req, res, next) => {
  try {
    const places = withRankings(await Place.find().lean());
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
router.get("/submit", requireAuth, (req, res) => {
  res.render("submit", {
    title: "Submit a Coffee Place",
    errors: [],
    values: {
      name: "",
      location: "",
      ordered: "",
      costRating: "",
      tasteRating: "",
      locationRating: "",
      vibeRating: "",
      notes: "",
    },
  });
});

// Handle form submission
router.post(
  "/submit",
  requireAuth,
  placeValidators,
  async (req, res, next) => {
    const errors = validationResult(req);
    const values = readValues(req.body);

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
        ordered: values.ordered,
        costRating: Number(values.costRating),
        tasteRating: Number(values.tasteRating),
        locationRating: Number(values.locationRating),
        vibeRating: Number(values.vibeRating),
        notes: values.notes,
      });
      res.redirect("/");
    } catch (err) {
      next(err);
    }
  }
);

// Update a place (inline edit from the rankings list)
router.put(
  "/places/:id",
  requireAuth,
  placeValidators,
  async (req, res, next) => {
    const errors = validationResult(req);
    const values = readValues(req.body);

    try {
      if (!errors.isEmpty()) {
        const places = withRankings(await Place.find().lean());
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
          ordered: values.ordered,
          costRating: Number(values.costRating),
          tasteRating: Number(values.tasteRating),
          locationRating: Number(values.locationRating),
          vibeRating: Number(values.vibeRating),
          notes: values.notes,
        },
        { runValidators: true }
      );
      res.redirect("/");
    } catch (err) {
      next(err);
    }
  }
);

// Delete a place
router.delete("/places/:id", requireAuth, async (req, res, next) => {
  try {
    await Place.findByIdAndDelete(req.params.id);
    res.redirect("/");
  } catch (err) {
    next(err);
  }
});

module.exports = router;
