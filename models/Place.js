const mongoose = require("mongoose");

const optionalRatingField = (label) => ({
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
    ownerName: {
      type: String,
      trim: true,
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
    imageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Image",
      default: null,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

function reviewOverall(review) {
  if (!review) return null;
  const values = [review.costRating, review.tasteRating, review.locationRating, review.vibeRating];
  if (!values.every((value) => typeof value === "number")) return null;
  return values.reduce((acc, value) => acc + value, 0) / 4;
}

// Overall rating is the average of available critic reviews.
placeSchema.virtual("overallRating").get(function () {
  const max = reviewOverall(this.maxReview);
  const margo = reviewOverall(this.margoReview);
  const values = [max, margo].filter((value) => typeof value === "number");
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
});

module.exports = mongoose.model("Place", placeSchema);
