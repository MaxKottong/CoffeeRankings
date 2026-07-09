const express = require("express");
const multer = require("multer");
const { body, validationResult } = require("express-validator");

const Place = require("../models/Place");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Store uploaded images in memory so we can persist them in MongoDB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      return cb(null, true);
    }
    cb(new Error("Only image files can be uploaded."));
  },
});

// Accept up to 6 images per place, but keep upload errors friendly.
const uploadImages = (req, res, next) => {
  upload.array("images", 6)(req, res, (err) => {
    if (err) {
      req.uploadError = err.message || "Image upload failed.";
    }
    next();
  });
};

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

// Turn uploaded files into image subdocuments.
function filesToImages(files) {
  return (files || []).map((file) => ({
    data: file.buffer,
    contentType: file.mimetype,
  }));
}

// Compute overall rating and strip heavy image buffers for rendering.
function toViewModel(place) {
  // Fall back to the legacy single `rating` (or 0) for older records.
  const fallback = typeof place.rating === "number" ? place.rating : 0;
  const cost =
    typeof place.costRating === "number" ? place.costRating : fallback;
  const taste =
    typeof place.tasteRating === "number" ? place.tasteRating : fallback;
  const location =
    typeof place.locationRating === "number" ? place.locationRating : fallback;
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
    owner: place.owner || "",
    ownerName: place.ownerName || "",
    overallRating: overall,
    // Only expose image ids so the template can build image URLs.
    images: (place.images || []).map((img) => ({ _id: img._id })),
    comments: place.comments || [],
  };
}

function withRankings(places) {
  return places
    .map(toViewModel)
    .sort(
      (a, b) =>
        b.overallRating - a.overallRating || a.name.localeCompare(b.name)
    );
}

// Split ranked places into per-owner sections for the home page.
function toSections(rankedPlaces) {
  const max = rankedPlaces.filter((p) => p.owner === "max.kottong@gmail.com");
  const margo = rankedPlaces.filter(
    (p) => p.owner === "margaretmclean1@me.com"
  );
  const other = rankedPlaces.filter(
    (p) =>
      p.owner !== "max.kottong@gmail.com" &&
      p.owner !== "margaretmclean1@me.com"
  );

  const sections = [
    { key: "max", title: "Max's Rankings", places: max },
    { key: "margo", title: "Margo's Rankings", places: margo },
  ];
  if (other.length) {
    sections.push({ key: "other", title: "Other Rankings", places: other });
  }
  return sections;
}

// Home page — list all coffee places, grouped by owner, highest rated first
router.get("/", async (req, res, next) => {
  try {
    const ranked = withRankings(await Place.find().lean());
    res.render("index", {
      title: "Coffee Rankings",
      sections: toSections(ranked),
      totalPlaces: ranked.length,
      editingId: null,
      editErrors: [],
      editValues: null,
    });
  } catch (err) {
    next(err);
  }
});

// Serve a place image
router.get("/places/:id/image/:imageId", async (req, res, next) => {
  try {
    const place = await Place.findById(req.params.id).select("images");
    if (!place) return res.status(404).end();
    const image = place.images.id(req.params.imageId);
    if (!image) return res.status(404).end();
    res.set("Content-Type", image.contentType);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.send(image.data);
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
  uploadImages,
  placeValidators,
  async (req, res, next) => {
    const errors = validationResult(req);
    const values = readValues(req.body);
    const extraErrors = req.uploadError ? [{ msg: req.uploadError }] : [];

    if (!errors.isEmpty() || extraErrors.length) {
      return res.status(400).render("submit", {
        title: "Submit a Coffee Place",
        errors: [...errors.array(), ...extraErrors],
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
        owner: req.session.user.email,
        ownerName: req.session.user.name,
        images: filesToImages(req.files),
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
  uploadImages,
  placeValidators,
  async (req, res, next) => {
    const errors = validationResult(req);
    const values = readValues(req.body);
    const extraErrors = req.uploadError ? [{ msg: req.uploadError }] : [];

    try {
      if (!errors.isEmpty() || extraErrors.length) {
        const ranked = withRankings(await Place.find().lean());
        return res.status(400).render("index", {
          title: "Coffee Rankings",
          sections: toSections(ranked),
          totalPlaces: ranked.length,
          editingId: req.params.id,
          editErrors: [...errors.array(), ...extraErrors],
          editValues: values,
        });
      }

      const place = await Place.findById(req.params.id);
      if (!place) return res.status(404).redirect("/");

      place.name = values.name;
      place.location = values.location;
      place.ordered = values.ordered;
      place.costRating = Number(values.costRating);
      place.tasteRating = Number(values.tasteRating);
      place.locationRating = Number(values.locationRating);
      place.vibeRating = Number(values.vibeRating);
      place.notes = values.notes;
      filesToImages(req.files).forEach((img) => place.images.push(img));

      await place.save();
      res.redirect("/");
    } catch (err) {
      next(err);
    }
  }
);

// Remove a single image from a place
router.delete(
  "/places/:id/image/:imageId",
  requireAuth,
  async (req, res, next) => {
    try {
      await Place.findByIdAndUpdate(req.params.id, {
        $pull: { images: { _id: req.params.imageId } },
      });
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

// Add a public comment (anyone can post)
router.post(
  "/places/:id/comments",
  body("body")
    .trim()
    .notEmpty()
    .withMessage("A comment cannot be empty.")
    .isLength({ max: 500 })
    .withMessage("Comment must be 500 characters or fewer."),
  body("author")
    .trim()
    .isLength({ max: 60 })
    .withMessage("Name must be 60 characters or fewer."),
  async (req, res, next) => {
    const errors = validationResult(req);
    try {
      if (errors.isEmpty()) {
        await Place.findByIdAndUpdate(req.params.id, {
          $push: {
            comments: {
              author: (req.body.author || "").trim() || "Anonymous",
              body: req.body.body.trim(),
            },
          },
        });
      }
      res.redirect("/#place-" + req.params.id);
    } catch (err) {
      next(err);
    }
  }
);

// Delete a comment (only logged-in users)
router.delete(
  "/places/:id/comments/:commentId",
  requireAuth,
  async (req, res, next) => {
    try {
      await Place.findByIdAndUpdate(req.params.id, {
        $pull: { comments: { _id: req.params.commentId } },
      });
      res.redirect("/#place-" + req.params.id);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
