const express = require("express");
const multer = require("multer");
const { body, validationResult } = require("express-validator");

const Place = require("../models/Place");
const User = require("../models/User");
const { requireAuth, requireAdmin } = require("../middleware/auth");

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

function emptyAdminSubmitValues() {
  return {
    name: "",
    location: "",
    maxOrdered: "",
    maxCostRating: "",
    maxTasteRating: "",
    maxLocationRating: "",
    maxVibeRating: "",
    sharedNotes: "",
    margoOrdered: "",
    margoCostRating: "",
    margoTasteRating: "",
    margoLocationRating: "",
    margoVibeRating: "",
  };
}

function readAdminValues(body) {
  const sharedNotes = body.sharedNotes || body.maxNotes || body.margoNotes || "";
  return {
    name: body.name || "",
    location: body.location || "",
    maxOrdered: body.maxOrdered || "",
    maxCostRating: body.maxCostRating || "",
    maxTasteRating: body.maxTasteRating || "",
    maxLocationRating: body.maxLocationRating || "",
    maxVibeRating: body.maxVibeRating || "",
    sharedNotes,
    margoOrdered: body.margoOrdered || "",
    margoCostRating: body.margoCostRating || "",
    margoTasteRating: body.margoTasteRating || "",
    margoLocationRating: body.margoLocationRating || "",
    margoVibeRating: body.margoVibeRating || "",
  };
}

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
    criticSlot: place.criticSlot || "",
    createdAt: place.createdAt,
    images: (place.images || []).map((img) => ({ _id: img._id })),
    ...breakdown,
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

function summarizeCommunityReviews(reviews) {
  const list = (reviews || []).map((review) => ({
    ...review,
    overallRating: ratingFromCommunityReview(review),
  }));
  const total = list.reduce((acc, review) => acc + review.overallRating, 0);

  return {
    list,
    average: list.length ? total / list.length : null,
    count: list.length,
  };
}

function criticsAverage(maxReview, margoReview) {
  const scores = [
    maxReview && maxReview.overallRating,
    margoReview && margoReview.overallRating,
  ].filter((score) => typeof score === "number");

  if (!scores.length) return null;
  return scores.reduce((acc, score) => acc + score, 0) / scores.length;
}

function isCommunityReviewOwner(review, sessionUser) {
  if (!review || !sessionUser) return false;

  const reviewUserId = String(review.accountUserId || "");
  const sessionUserId = String(sessionUser.id || "");
  if (reviewUserId && sessionUserId && reviewUserId === sessionUserId) {
    return true;
  }

  const reviewUsername = String(review.accountUsername || "").trim().toLowerCase();
  const sessionUsername = String(sessionUser.username || "").trim().toLowerCase();
  if (reviewUsername && sessionUsername && reviewUsername === sessionUsername) {
    return true;
  }

  const reviewEmail = String(review.accountEmail || "").trim().toLowerCase();
  const sessionEmail = String(sessionUser.email || "").trim().toLowerCase();
  if (reviewEmail && sessionEmail && reviewEmail === sessionEmail) {
    return true;
  }

  return false;
}

function criticSlotForDoc(doc) {
  const slot = String(doc.criticSlot || "").trim().toLowerCase();
  if (slot === "max" || slot === "margo") return slot;

  const ownerName = String(doc.ownerName || "").trim().toLowerCase();
  if (ownerName === "max") return "max";
  if (ownerName === "margo") return "margo";
  return "";
}

function buildCriticSection(values, prefix) {
  const ratingFields = ["CostRating", "TasteRating", "LocationRating", "VibeRating"];
  const sharedNotes = String(values.sharedNotes || "").trim();
  const hasAnyInput =
    String(values[`${prefix}Ordered`] || "").trim() ||
    sharedNotes ||
    ratingFields.some((field) => String(values[`${prefix}${field}`] || "").trim());

  return {
    provided: !!hasAnyInput,
    ordered: String(values[`${prefix}Ordered`] || "").trim(),
    costRating: values[`${prefix}CostRating`],
    tasteRating: values[`${prefix}TasteRating`],
    locationRating: values[`${prefix}LocationRating`],
    vibeRating: values[`${prefix}VibeRating`],
    notes: sharedNotes,
  };
}

function parseRating(raw, label, errors) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 10) {
    errors.push({ msg: `${label} must be a number between 0 and 10.` });
    return null;
  }
  return value;
}

function validateAdminCriticValues(values) {
  const errors = [];
  const name = String(values.name || "").trim();
  const location = String(values.location || "").trim();
  const max = buildCriticSection(values, "max");
  const margo = buildCriticSection(values, "margo");

  if (!name) {
    errors.push({ msg: "Please enter the name of the place." });
  }
  if (name.length > 120) {
    errors.push({ msg: "Name must be 120 characters or fewer." });
  }
  if (location.length > 160) {
    errors.push({ msg: "Location must be 160 characters or fewer." });
  }
  if (String(values.sharedNotes || "").trim().length > 1000) {
    errors.push({ msg: "Shared notes must be 1000 characters or fewer." });
  }

  if (!max.provided && !margo.provided) {
    errors.push({ msg: "Add ratings for at least Max or Margo." });
  }

  function validateSection(section, label) {
    if (!section.provided) return;
    section.costRating = parseRating(section.costRating, `${label} cost rating`, errors);
    section.tasteRating = parseRating(section.tasteRating, `${label} taste rating`, errors);
    section.locationRating = parseRating(section.locationRating, `${label} location rating`, errors);
    section.vibeRating = parseRating(section.vibeRating, `${label} vibe rating`, errors);

    if (section.ordered.length > 200) {
      errors.push({ msg: `${label} ordered field must be 200 characters or fewer.` });
    }
  }

  validateSection(max, "Max");
  validateSection(margo, "Margo");

  return {
    errors,
    normalized: {
      name,
      location,
      max,
      margo,
    },
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
        docs: [],
      });
    }

    groups.get(key).docs.push({
      ...place,
      communityReviews: placeDoc.communityReviews || [],
    });
  });

  return Array.from(groups.values())
    .map((group) => {
      const sortedDocs = group.docs.slice().sort((a, b) => {
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
      const maxReview =
        sortedDocs.find((doc) => criticSlotForDoc(doc) === "max") || null;
      const margoReview =
        sortedDocs.find((doc) => criticSlotForDoc(doc) === "margo") || null;
      const anchor = maxReview || margoReview || sortedDocs[0];
      const latestImageDoc = sortedDocs
        .slice()
        .reverse()
        .find((doc) => Array.isArray(doc.images) && doc.images.length);
      const image = latestImageDoc
        ? latestImageDoc.images[latestImageDoc.images.length - 1]
        : null;
      const latestReview = sortedDocs[sortedDocs.length - 1] || null;
      const community = summarizeCommunityReviews(anchor.communityReviews || []);
      const criticAverage = criticsAverage(maxReview, margoReview);

      return {
        key: group.key,
        anchorId: anchor._id,
        name: group.name,
        location: group.location,
        image,
        maxReview,
        margoReview,
        criticsAverage: criticAverage,
        communityRating: community.average,
        communityReviewCount: community.count,
        communityReviews: community.list,
        latestReview,
        compositeScore:
          typeof criticAverage === "number"
            ? criticAverage
            : typeof community.average === "number"
            ? community.average
            : 0,
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
  options = {
    statusCode: 200,
    communityErrors: [],
    communityValues: null,
    criticErrors: [],
    criticValues: null,
  }
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

  const emailsNeedingLookup = (place.communityReviews || [])
    .filter(
      (review) =>
        !String(review.accountUsername || "").trim() &&
        String(review.accountEmail || "").trim()
    )
    .map((review) => String(review.accountEmail || "").trim().toLowerCase());

  if (emailsNeedingLookup.length) {
    const users = await User.find({
      email: { $in: Array.from(new Set(emailsNeedingLookup)) },
    })
      .select("email username")
      .lean();

    const usernameByEmail = new Map(
      users.map((user) => [
        String(user.email || "").toLowerCase(),
        String(user.username || "").toLowerCase(),
      ])
    );

    place.communityReviews = (place.communityReviews || []).map((review) => {
      if (String(review.accountUsername || "").trim()) {
        return review;
      }
      const email = String(review.accountEmail || "").trim().toLowerCase();
      const accountUsername = usernameByEmail.get(email) || "";
      return {
        ...review,
        accountUsername,
      };
    });
  }

  const fallbackCriticValues = {
    name: place.name,
    location: place.location || "",
    maxOrdered: (place.maxReview && place.maxReview.ordered) || "",
    maxCostRating:
      place.maxReview && typeof place.maxReview.costRating === "number"
        ? place.maxReview.costRating.toFixed(1)
        : "",
    maxTasteRating:
      place.maxReview && typeof place.maxReview.tasteRating === "number"
        ? place.maxReview.tasteRating.toFixed(1)
        : "",
    maxLocationRating:
      place.maxReview && typeof place.maxReview.locationRating === "number"
        ? place.maxReview.locationRating.toFixed(1)
        : "",
    maxVibeRating:
      place.maxReview && typeof place.maxReview.vibeRating === "number"
        ? place.maxReview.vibeRating.toFixed(1)
        : "",
    sharedNotes:
      (place.maxReview && place.maxReview.notes) ||
      (place.margoReview && place.margoReview.notes) ||
      "",
    margoOrdered: (place.margoReview && place.margoReview.ordered) || "",
    margoCostRating:
      place.margoReview && typeof place.margoReview.costRating === "number"
        ? place.margoReview.costRating.toFixed(1)
        : "",
    margoTasteRating:
      place.margoReview && typeof place.margoReview.tasteRating === "number"
        ? place.margoReview.tasteRating.toFixed(1)
        : "",
    margoLocationRating:
      place.margoReview && typeof place.margoReview.locationRating === "number"
        ? place.margoReview.locationRating.toFixed(1)
        : "",
    margoVibeRating:
      place.margoReview && typeof place.margoReview.vibeRating === "number"
        ? place.margoReview.vibeRating.toFixed(1)
        : "",
  };

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
    criticErrors: options.criticErrors || [],
    criticValues: options.criticValues || fallbackCriticValues,
  });
}

async function upsertCriticDoc({
  existing,
  ownerEmail,
  ownerName,
  criticSlot,
  common,
  section,
  images,
}) {
  if (!section.provided && !existing) {
    return;
  }

  const doc = existing || new Place();
  doc.name = common.name;
  doc.location = common.location;
  doc.owner = ownerEmail;
  doc.ownerName = ownerName;
  doc.criticSlot = criticSlot;

  if (section.provided) {
    doc.ordered = section.ordered;
    doc.costRating = section.costRating;
    doc.tasteRating = section.tasteRating;
    doc.locationRating = section.locationRating;
    doc.vibeRating = section.vibeRating;
    doc.notes = section.notes;
  }

  (images || []).forEach((img) => doc.images.push(img));
  await doc.save();
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
    const searchTerm = String(req.query.q || "").trim();
    const grouped = consolidatePlaces(await Place.find().lean());
    const places = searchTerm
      ? grouped.filter((place) =>
          String(place.name || "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
        )
      : grouped;

    res.render("reviews", {
      title: "Reviews",
      places,
      totalPlaces: places.length,
      searchTerm,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/about", (req, res) => {
  res.render("about", {
    title: "About Us",
  });
});

router.get("/contact", (req, res) => {
  res.render("contact", {
    title: "Contact",
  });
});

// Full place page.
router.get("/places/:id", async (req, res, next) => {
  try {
    await renderPlacePage(req, res, req.params.id);
  } catch (err) {
    next(err);
  }
});

// Serve a place image.
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

// Submission form.
router.get("/submit", requireAuth, requireAdmin, (req, res) => {
  res.render("submit", {
    title: "Submit a Coffee Place",
    errors: [],
    values: emptyAdminSubmitValues(),
    isAdmin: true,
  });
});

// Handle form submission.
router.post(
  "/submit",
  requireAuth,
  requireAdmin,
  uploadImages,
  async (req, res, next) => {
    const values = readAdminValues(req.body);
    const parsed = validateAdminCriticValues(values);
    const errors = parsed.errors.slice();
    if (req.uploadError) errors.push({ msg: req.uploadError });

    if (errors.length) {
      return res.status(400).render("submit", {
        title: "Submit a Coffee Place",
        errors,
        values,
        isAdmin: true,
      });
    }

    try {
      const images = filesToImages(req.files);
      const adminEmail = String((req.session.user && req.session.user.email) || "")
        .trim()
        .toLowerCase();

      await Promise.all([
        upsertCriticDoc({
          existing: null,
          ownerEmail: adminEmail,
          ownerName: "Max",
          criticSlot: "max",
          common: parsed.normalized,
          section: parsed.normalized.max,
          images,
        }),
        upsertCriticDoc({
          existing: null,
          ownerEmail: adminEmail,
          ownerName: "Margo",
          criticSlot: "margo",
          common: parsed.normalized,
          section: parsed.normalized.margo,
          images,
        }),
      ]);

      res.redirect("/reviews");
    } catch (err) {
      next(err);
    }
  }
);

// Admin inline edit of Max/Margo critic data on full page.
router.put(
  "/places/:id/critics",
  requireAuth,
  requireAdmin,
  uploadImages,
  async (req, res, next) => {
    const values = readAdminValues(req.body);
    const parsed = validateAdminCriticValues(values);
    const errors = parsed.errors.slice();
    if (req.uploadError) errors.push({ msg: req.uploadError });

    try {
      const base = await Place.findById(req.params.id);
      if (!base) {
        return res.status(404).render("error", {
          title: "Not Found",
          message: "This coffee place could not be found.",
        });
      }

      if (errors.length) {
        return renderPlacePage(req, res, req.params.id, {
          statusCode: 400,
          criticErrors: errors,
          criticValues: values,
        });
      }

      const key = placeKey(base);
      const all = await Place.find();
      const groupDocs = all.filter((doc) => placeKey(doc) === key);
      const maxDoc =
        groupDocs.find((doc) => criticSlotForDoc(doc) === "max") || null;
      const margoDoc =
        groupDocs.find((doc) => criticSlotForDoc(doc) === "margo") || null;

      const adminEmail = String((req.session.user && req.session.user.email) || "")
        .trim()
        .toLowerCase();
      const images = filesToImages(req.files);

      await Promise.all([
        upsertCriticDoc({
          existing: maxDoc,
          ownerEmail: adminEmail,
          ownerName: "Max",
          criticSlot: "max",
          common: parsed.normalized,
          section: parsed.normalized.max,
          images,
        }),
        upsertCriticDoc({
          existing: margoDoc,
          ownerEmail: adminEmail,
          ownerName: "Margo",
          criticSlot: "margo",
          common: parsed.normalized,
          section: parsed.normalized.margo,
          images,
        }),
      ]);

      const refreshedBase = await Place.findOne({
        name: parsed.normalized.name,
        location: parsed.normalized.location,
        criticSlot: { $in: ["max", "margo"] },
      }).lean();

      if (refreshedBase) {
        return res.redirect(`/places/${refreshedBase._id}`);
      }

      return res.redirect("/reviews");
    } catch (err) {
      next(err);
    }
  }
);

// Remove a single image from a place.
router.delete(
  "/places/:id/image/:imageId",
  requireAuth,
  requireAdmin,
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

// Delete all Max/Margo docs for this consolidated place.
router.delete(
  "/places/:id/consolidated",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const base = await Place.findById(req.params.id).lean();
      if (!base) return res.redirect("/reviews");

      const key = placeKey(base);
      const all = await Place.find()
        .select("_id name location owner ownerName criticSlot")
        .lean();
      const ids = all
        .filter((doc) => placeKey(doc) === key)
        .filter((doc) => ["max", "margo"].includes(criticSlotForDoc(doc)))
        .map((doc) => doc._id);

      if (ids.length) {
        await Place.deleteMany({ _id: { $in: ids } });
      }

      res.redirect("/reviews");
    } catch (err) {
      next(err);
    }
  }
);

// Add a community review with ratings that feed the community score.
router.post(
  "/places/:id/community-reviews",
  requireAuth,
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
    .isLength({ max: 1000 })
    .withMessage("Notes must be 1000 characters or fewer."),
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
            accountUserId: req.session.user.id,
            accountUsername: String(req.session.user.username || "")
              .trim()
              .toLowerCase(),
            accountEmail: String(req.session.user.email || "").trim().toLowerCase(),
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

// Delete a community review (admins only).
router.put(
  "/places/:id/community-reviews/:reviewId",
  requireAuth,
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
    .isLength({ max: 1000 })
    .withMessage("Notes must be 1000 characters or fewer."),
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

      const place = await Place.findById(req.params.id);
      if (!place) {
        return res.status(404).render("error", {
          title: "Not Found",
          message: "This coffee place could not be found.",
        });
      }

      const review = place.communityReviews.id(req.params.reviewId);
      if (!review) {
        return res.status(404).render("error", {
          title: "Not Found",
          message: "This community review could not be found.",
        });
      }

      const canManage =
        !!(req.session.user && req.session.user.isAdmin) ||
        isCommunityReviewOwner(review, req.session.user);

      if (!canManage) {
        return res.status(403).render("error", {
          title: "Forbidden",
          message: "You can only edit your own community reviews.",
        });
      }

      review.author = values.author.trim() || "Anonymous";
      review.ordered = values.ordered.trim();
      review.costRating = Number(values.costRating);
      review.tasteRating = Number(values.tasteRating);
      review.locationRating = Number(values.locationRating);
      review.vibeRating = Number(values.vibeRating);
      review.notes = values.notes.trim();

      await place.save();
      res.redirect(`/places/${req.params.id}#community-reviews`);
    } catch (err) {
      next(err);
    }
  }
);

// Delete a community review (admins or owner).
router.delete(
  "/places/:id/community-reviews/:reviewId",
  requireAuth,
  async (req, res, next) => {
    try {
      const place = await Place.findById(req.params.id);
      if (!place) {
        return res.status(404).render("error", {
          title: "Not Found",
          message: "This coffee place could not be found.",
        });
      }

      const review = place.communityReviews.id(req.params.reviewId);
      if (!review) {
        return res.status(404).render("error", {
          title: "Not Found",
          message: "This community review could not be found.",
        });
      }

      const canManage =
        !!(req.session.user && req.session.user.isAdmin) ||
        isCommunityReviewOwner(review, req.session.user);

      if (!canManage) {
        return res.status(403).render("error", {
          title: "Forbidden",
          message: "You can only delete your own community reviews.",
        });
      }

      review.deleteOne();
      await place.save();
      res.redirect(`/places/${req.params.id}#community-reviews`);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
