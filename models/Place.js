const mongoose = require("mongoose");

const ratingField = (label) => ({
  type: Number,
  min: [0, `${label} rating cannot be below 0.`],
  max: [10, `${label} rating cannot be above 10.`],
  default: null,
});

const criticReviewSchema = new mongoose.Schema(
  {
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
  },
  { _id: false }
);

const imageSchema = new mongoose.Schema({
  data: {
    type: Buffer,
    required: true,
  },
  contentType: {
    type: String,
    required: true,
    default: "image/jpeg",
  },
});

const communityReviewSchema = new mongoose.Schema(
  {
    accountUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    accountUsername: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    accountEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
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
      maxlength: [500, "Notes must be 500 characters or fewer."],
      default: "",
    },
  },
  { timestamps: true }
);

const placeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "A name is required."],
      trim: true,
      maxlength: [120, "Name must be 120 characters or fewer."],
    },
    location: {
      type: String,
      trim: true,
      maxlength: [160, "Location must be 160 characters or fewer."],
      default: "",
    },
    owner: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    ownerName: {
      type: String,
      trim: true,
      default: "",
    },
    criticSlot: {
      type: String,
      enum: ["", "max", "margo"],
      default: "",
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
      maxlength: [500, "Notes must be 500 characters or fewer."],
      default: "",
    },
    images: {
      type: [imageSchema],
      default: [],
    },
    communityReviews: {
      type: [communityReviewSchema],
      default: [],
    },
    maxReview: criticReviewSchema,
    margoReview: criticReviewSchema,
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

module.exports = mongoose.model("Place", placeSchema);
