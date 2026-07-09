const mongoose = require("mongoose");

const ratingField = (label) => ({
  type: Number,
  required: [true, `A ${label} rating is required.`],
  min: [0, `${label} rating cannot be below 0.`],
  max: [10, `${label} rating cannot be above 10.`],
});

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
      maxlength: [500, "Notes must be 500 characters or fewer."],
      default: "",
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Overall rating is the average of the four category ratings.
placeSchema.virtual("overallRating").get(function () {
  return (
    (this.costRating + this.tasteRating + this.locationRating + this.vibeRating) /
    4
  );
});

module.exports = mongoose.model("Place", placeSchema);
