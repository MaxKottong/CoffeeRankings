const mongoose = require("mongoose");

const ratingField = (label) => ({
  type: Number,
  required: [true, `A ${label} rating is required.`],
  min: [0, `${label} rating cannot be below 0.`],
  max: [10, `${label} rating cannot be above 10.`],
});

const communityReviewSchema = new mongoose.Schema(
  {
    placeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Place",
      required: true,
      index: true,
    },
    accountUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    accountUsername: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [40, "Account username must be 40 characters or fewer."],
      default: "",
      index: true,
    },
    accountEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [160, "Account email must be 160 characters or fewer."],
      default: "",
      index: true,
    },
    author: {
      type: String,
      trim: true,
      maxlength: [60, "Name must be 60 characters or fewer."],
      default: "Anonymous",
    },
    ordered: {
      type: String,
      trim: true,
      maxlength: [200, "What was ordered must be 200 characters or fewer."],
      default: "",
    },
    costRating: ratingField("cost"),
    tasteRating: ratingField("taste"),
    locationRating: ratingField("location"),
    vibeRating: ratingField("vibe"),
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes must be 1000 characters or fewer."],
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CommunityReview", communityReviewSchema);
