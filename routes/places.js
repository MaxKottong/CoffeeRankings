const express = require("express");
const multer = require("multer");
const { body, validationResult } = require("express-validator");

const Place = require("../models/Place");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const MAX_OWNER = "max.kottong@gmail.com";
const MARGO_OWNER = "margaretmclean1@me.com";

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

function normalized(text) {
  return String(text || "")
    .trim()
    .toLowerCase();
}

function placeKey(place) {
  return `${normalized(place.name)}|${normalized(place.location)}`;
}

function placeKeyFromParts(name, location) {
  return `${normalized(name)}|${normalized(location)}`;
}

function toRatingBreakdown(place) {
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
    costRating: cost,
    tasteRating: taste,
    locationRating: location,
    vibeRating: vibe,
    overallRating: overall,
  };
}

function toReviewView(place) {
  const breakdown = toRatingBreakdown(place);
  return {
    _id: place._id,
    name: place.name,
    location: place.location,
    ordered: place.ordered || "",
    notes: place.notes || "",
    owner: place.owner || "",
    ownerName: place.ownerName || "",
    createdAt: place.createdAt,
    images: (place.images || []).map((img) => ({ _id: img._id })),
    ...breakdown,
  };
}

function ratingFromReview(review) {
  return (
    (review.costRating +
      review.tasteRating +
      review.locationRating +
      review.vibeRating) /
    4
  );
}

function summarizeCommunityReviews(reviews) {
  const list = (reviews || []).map((review) => ({
    ...review,
    overallRating: ratingFromReview(review),
  }));
  const total = list.reduce((acc, review) => acc + review.overallRating, 0);

  return {
    list,
    average: list.length ? total / list.length : null,
    count: list.length,
  };
}

function consolidatePlaces(places) {
  const groups = new Map();

  (places || []).forEach((placeDoc) => {
    const place = toReviewView(placeDoc);
    const key = placeKey(place);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: place.name,
        location: place.location,
        image: place.images[0] || null,
        docs: [],
      });
    }

    if (!groups.get(key).image && place.images && place.images.length) {
      groups.get(key).image = place.images[0];
    }

    groups.get(key).docs.push({
      ...place,
      comments: placeDoc.comments || [],
      communityReviews: placeDoc.communityReviews || [],
    });
  });

  return Array.from(groups.values())
    .map((group) => {
      const sortedDocs = group.docs.slice().sort((a, b) => {
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
      const maxReview = sortedDocs.find((doc) => doc.owner === MAX_OWNER) || null;
      const margoReview =
        sortedDocs.find((doc) => doc.owner === MARGO_OWNER) || null;
      const anchor = maxReview || margoReview || sortedDocs[0];
      const latestReview = sortedDocs[sortedDocs.length - 1] || null;
      const community = summarizeCommunityReviews(anchor.communityReviews || []);

      const totalScore = [
        maxReview && maxReview.overallRating,
        margoReview && margoReview.overallRating,
        community.average,
      ]
        .filter((score) => typeof score === "number")
        .reduce((acc, score) => acc + score, 0);
      const scoreCount =
        (maxReview ? 1 : 0) +
        (margoReview ? 1 : 0) +
        (typeof community.average === "number" ? 1 : 0);

      return {
        key: group.key,
        anchorId: anchor._id,
        name: group.name,
        location: group.location,
        image: group.image,
        maxReview,
        margoReview,
        communityRating: community.average,
        communityReviewCount: community.count,
        communityReviews: community.list,
        comments: anchor.comments || [],
        latestReview,
        compositeScore: scoreCount ? totalScore / scoreCount : 0,
      };
    })
    .sort(
      (a, b) =>
        b.compositeScore - a.compositeScore || a.name.localeCompare(b.name)
    );
}

async function renderPlacePage(
  req,
  res,
  placeId,
  options = { statusCode: 200, communityErrors: [], communityValues: null }
) {
  const base = await Place.findById(placeId).lean();
  if (!base) {
    return res.status(404).render("error", {
      title: "Not Found",
      message: "This coffee place could not be found.",
    });
  }

  const allPlaces = await Place.find().lean();
  const key = placeKeyFromParts(base.name, base.location);
  const grouped = consolidatePlaces(allPlaces);
  const place = grouped.find((entry) => entry.key === key);

  if (!place) {
    return res.status(404).render("error", {
      title: "Not Found",
      message: "This coffee place could not be found.",
    });
  }

  return res.status(options.statusCode || 200).render("place-detail", {
    title: `${place.name} Reviews`,
    place,
    communityErrors: options.communityErrors || [],
    communityValues: options.communityValues || {
      author: "",
      ordered: "",
      costRating: "",
      tasteRating: "",
      locationRating: "",
      vibeRating: "",
      notes: "",
    },
  });
}

// Home page — show only the most recently created review from the DB.
router.get("/", async (req, res, next) => {
  try {
    const allPlaces = await Place.find().lean();
    const latestRaw = allPlaces
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const grouped = consolidatePlaces(allPlaces);
    const latestPlace = latestRaw
      ? grouped.find((entry) => entry.key === placeKey(latestRaw)) || null
      : null;

    res.render("index", {
      title: "Coffee Rankings",
      latestPlace,
    });
  } catch (err) {
    next(err);
  }
});

// Reviews page — consolidated Max + Margo cards.
router.get("/reviews", async (req, res, next) => {
  try {
    const grouped = consolidatePlaces(await Place.find().lean());
    res.render("reviews", {
      title: "Reviews",
      places: grouped,
      totalPlaces: grouped.length,
    });
  } catch (err) {
    next(err);
  }
});

// Full place page
router.get("/places/:id", async (req, res, next) => {
  try {
    await renderPlacePage(req, res, req.params.id);
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
      res.redirect("/reviews");
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
        return res.status(400).render("error", {
          title: "Validation Error",
          message: [...errors.array(), ...extraErrors]
            .map((entry) => entry.msg)
            .join(" "),
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
      res.redirect(`/places/${place._id}`);
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
      res.redirect(`/places/${req.params.id}`);
    } catch (err) {
      next(err);
    }
  }
);

// Delete a place
router.delete("/places/:id", requireAuth, async (req, res, next) => {
  try {
    await Place.findByIdAndDelete(req.params.id);
    res.redirect("/reviews");
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
      res.redirect(`/places/${req.params.id}#comments`);
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
      res.redirect(`/places/${req.params.id}#comments`);
    } catch (err) {
      next(err);
    }
  }
);

// Add a community review with ratings that feed the community score.
router.post(
  "/places/:id/community-reviews",
  body("author")
    .trim()
    .isLength({ max: 60 })
    .withMessage("Name must be 60 characters or fewer."),
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
  async (req, res, next) => {
    const errors = validationResult(req);
    const values = {
      author: req.body.author || "",
      ordered: req.body.ordered || "",
      costRating: req.body.costRating || "",
      tasteRating: req.body.tasteRating || "",
      locationRating: req.body.locationRating || "",
      vibeRating: req.body.vibeRating || "",
      notes: req.body.notes || "",
    };

    try {
      if (!errors.isEmpty()) {
        return renderPlacePage(req, res, req.params.id, {
          statusCode: 400,
          communityErrors: errors.array(),
          communityValues: values,
        });
      }

      await Place.findByIdAndUpdate(req.params.id, {
        $push: {
          communityReviews: {
            author: values.author.trim() || "Anonymous",
            ordered: values.ordered.trim(),
            costRating: Number(values.costRating),
            tasteRating: Number(values.tasteRating),
            locationRating: Number(values.locationRating),
            vibeRating: Number(values.vibeRating),
            notes: values.notes.trim(),
          },
        },
      });
      res.redirect(`/places/${req.params.id}#community-reviews`);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
