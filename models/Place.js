const mongoose = require("mongoose");

const ratingField = (label) => ({
  type: Number,
  required: [true, `A ${label} rating is required.`],
  min: [0, `${label} rating cannot be below 0.`],
  max: [10, `${label} rating cannot be above 10.`],
});

const optionalRatingField = (label) => ({
  type: Number,
  min: [0, `${label} rating cannot be below 0.`],
  max: [10, `${label} rating cannot be above 10.`],
  default: null,
});

const imageSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true },
  },
  { _id: true }
);

const criticReviewSchema = new mongoose.Schema(
  {
    ordered: {
      type: String,
      trim: true,
      maxlength: [200, "What was ordered must be 200 characters or fewer."],
      default: "",
    },
    costRating: optionalRatingField("cost"),
    tasteRating: optionalRatingField("taste"),
    locationRating: optionalRatingField("location"),
    vibeRating: optionalRatingField("vibe"),
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes must be 1000 characters or fewer."],
      default: "",
    },
  },
  { _id: false }
);

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
      maxlength: [40, "Account username must be 40 characters or fewer."],
      default: "",
    },
    accountEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [160, "Account email must be 160 characters or fewer."],
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
    // Legacy critic-slot fields retained for backwards compatibility.
    costRating: optionalRatingField("cost"),
    tasteRating: optionalRatingField("taste"),
    locationRating: optionalRatingField("location"),
    vibeRating: optionalRatingField("vibe"),
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, "Notes must be 1000 characters or fewer."],
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
    owner: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    ownerName: {
      type: String,
      trim: true,
      default: "",
    },
    criticSlot: {
      type: String,
      enum: ["max", "margo", ""],
      default: "",
    },
    maxReview: {
      type: criticReviewSchema,
      default: () => ({}),
    },
    margoReview: {
      type: criticReviewSchema,
      default: () => ({}),
    },
    imageIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Image",
      },
    ],
    // Legacy inline images retained to read old data.
    images: [imageSchema],
    communityReviews: [communityReviewSchema],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Overall rating is the average of the four category ratings.
placeSchema.virtual("overallRating").get(function () {
  const fields = [this.costRating, this.tasteRating, this.locationRating, this.vibeRating];
  const hasAllLegacyRatings = fields.every((value) => typeof value === "number");
  if (!hasAllLegacyRatings) {
    return 0;
  }
  return (
    (this.costRating + this.tasteRating + this.locationRating + this.vibeRating) /
    4
  );
});

module.exports = mongoose.model("Place", placeSchema);
