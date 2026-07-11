require("dotenv").config();

const mongoose = require("mongoose");
const Place = require("../models/Place");
const Image = require("../models/Image");
const CommunityReview = require("../models/CommunityReview");

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/coffee_ratings";

function normalized(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function placeKey(doc) {
  return `${normalized(doc.name)}|${normalized(doc.location)}`;
}

function hasEmbeddedReviewData(review) {
  if (!review) return false;
  return Boolean(
    String(review.ordered || "").trim() ||
      String(review.notes || "").trim() ||
      [review.costRating, review.tasteRating, review.locationRating, review.vibeRating].some(
        (value) => typeof value === "number"
      )
  );
}

function legacySlot(doc) {
  const slot = String(doc.criticSlot || "").trim().toLowerCase();
  if (slot === "max" || slot === "margo") return slot;
  const ownerName = String(doc.ownerName || "").trim().toLowerCase();
  if (ownerName === "max") return "max";
  if (ownerName === "margo") return "margo";
  return "";
}

function mapLegacyReview(doc, sharedNotes) {
  return {
    ordered: String(doc.ordered || "").trim(),
    costRating: typeof doc.costRating === "number" ? doc.costRating : null,
    tasteRating: typeof doc.tasteRating === "number" ? doc.tasteRating : null,
    locationRating: typeof doc.locationRating === "number" ? doc.locationRating : null,
    vibeRating: typeof doc.vibeRating === "number" ? doc.vibeRating : null,
    notes: sharedNotes,
  };
}

async function convertLegacyImagesToImageIds(doc) {
  const legacyImages = Array.isArray(doc.images) ? doc.images : [];
  if (!legacyImages.length) return [];

  const inserted = await Image.insertMany(
    legacyImages.map((img) => ({
      data: img.data,
      contentType: img.contentType || "image/jpeg",
    }))
  );
  return inserted.map((img) => img._id);
}

function mapCommunityReview(placeId, review) {
  return {
    placeId,
    accountUserId: review.accountUserId || null,
    accountUsername: String(review.accountUsername || "").trim().toLowerCase(),
    accountEmail: String(review.accountEmail || "").trim().toLowerCase(),
    author: review.author || "Anonymous",
    ordered: review.ordered || "",
    costRating: Number(review.costRating) || 0,
    tasteRating: Number(review.tasteRating) || 0,
    locationRating: Number(review.locationRating) || 0,
    vibeRating: Number(review.vibeRating) || 0,
    notes: review.notes || "",
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

async function migrateGroup(groupDocs) {
  const sorted = groupDocs
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const modernCandidates = sorted.filter(
    (doc) =>
      String(doc.criticSlot || "").trim() === "" &&
      (hasEmbeddedReviewData(doc.maxReview) ||
        hasEmbeddedReviewData(doc.margoReview) ||
        (Array.isArray(doc.imageIds) && doc.imageIds.length) ||
        (Array.isArray(doc.communityReviews) && doc.communityReviews.length))
  );

  const latestModern = modernCandidates.length
    ? modernCandidates[modernCandidates.length - 1]
    : null;

  const latestMaxLegacy =
    sorted
      .slice()
      .reverse()
      .find((doc) => legacySlot(doc) === "max") || null;
  const latestMargoLegacy =
    sorted
      .slice()
      .reverse()
      .find((doc) => legacySlot(doc) === "margo") || null;

  const sharedNotes = String(
    (latestMaxLegacy && latestMaxLegacy.notes) ||
      (latestMargoLegacy && latestMargoLegacy.notes) ||
      ""
  ).trim();

  const target = latestModern ? await Place.findById(latestModern._id) : new Place();
  target.name = sorted[0].name;
  target.location = sorted[0].location || "";
  target.criticSlot = "";
  target.ownerName = "Max + Margo";

  if (!hasEmbeddedReviewData(target.maxReview) && latestMaxLegacy) {
    target.maxReview = mapLegacyReview(latestMaxLegacy, sharedNotes);
  } else if (hasEmbeddedReviewData(target.maxReview) && sharedNotes) {
    target.maxReview.notes = sharedNotes;
  }

  if (!hasEmbeddedReviewData(target.margoReview) && latestMargoLegacy) {
    target.margoReview = mapLegacyReview(latestMargoLegacy, sharedNotes);
  } else if (hasEmbeddedReviewData(target.margoReview) && sharedNotes) {
    target.margoReview.notes = sharedNotes;
  }

  if (!Array.isArray(target.imageIds)) {
    target.imageIds = [];
  }

  const imageIdSet = new Set((target.imageIds || []).map((id) => String(id)));

  for (const doc of sorted) {
    const imageIds = Array.isArray(doc.imageIds) ? doc.imageIds : [];
    imageIds.forEach((id) => imageIdSet.add(String(id)));

    if (String(doc._id) !== String(target._id)) {
      const convertedIds = await convertLegacyImagesToImageIds(doc);
      convertedIds.forEach((id) => imageIdSet.add(String(id)));
    }
  }

  target.imageIds = Array.from(imageIdSet).map((id) => new mongoose.Types.ObjectId(id));

  const allCommunityReviews = sorted.flatMap((doc) =>
    (doc.communityReviews || []).map((review) => mapCommunityReview(target._id, review))
  );
  if (allCommunityReviews.length) {
    await CommunityReview.insertMany(allCommunityReviews);
  }

  target.communityReviews = [];

  await target.save();

  const idsToDelete = sorted
    .map((doc) => doc._id)
    .filter((id) => String(id) !== String(target._id));

  if (idsToDelete.length) {
    await Place.deleteMany({ _id: { $in: idsToDelete } });
  }

  return { kept: String(target._id), removed: idsToDelete.length };
}

async function run() {
  await mongoose.connect(MONGODB_URI);

  const docs = await Place.find().lean();
  const groups = new Map();
  docs.forEach((doc) => {
    const key = placeKey(doc);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  });

  let migratedGroups = 0;
  let removedDocs = 0;

  for (const [key, groupDocs] of groups.entries()) {
    if (groupDocs.length <= 1) continue;
    const result = await migrateGroup(groupDocs);
    migratedGroups += 1;
    removedDocs += result.removed;
    console.log(`Migrated ${key}: kept ${result.kept}, removed ${result.removed}`);
  }

  console.log(`Done. Migrated groups: ${migratedGroups}, removed docs: ${removedDocs}`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Migration failed:", err);
  try {
    await mongoose.disconnect();
  } catch (disconnectErr) {
    console.error("Disconnect failed:", disconnectErr);
  }
  process.exit(1);
});
