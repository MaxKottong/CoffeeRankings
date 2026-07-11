require("dotenv").config();

const mongoose = require("mongoose");
const Place = require("../models/Place");
const CommunityReview = require("../models/CommunityReview");

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/coffee_ratings";

function toReviewDoc(placeId, review) {
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

async function run() {
  await mongoose.connect(MONGODB_URI);

  const places = await Place.find({ "communityReviews.0": { $exists: true } });
  let movedCount = 0;
  let placeCount = 0;

  for (const place of places) {
    const reviews = (place.communityReviews || []).map((review) =>
      toReviewDoc(place._id, review)
    );

    if (!reviews.length) continue;

    await CommunityReview.insertMany(reviews);
    movedCount += reviews.length;
    placeCount += 1;

    place.communityReviews = [];
    await place.save();
  }

  console.log(`Moved ${movedCount} community reviews from ${placeCount} places.`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Community review migration failed:", err);
  try {
    await mongoose.disconnect();
  } catch (disconnectErr) {
    console.error("Disconnect failed:", disconnectErr);
  }
  process.exit(1);
});
