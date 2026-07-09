const mongoose = require("mongoose");

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
    rating: {
      type: Number,
      required: [true, "A rating is required."],
      min: [0, "Rating cannot be below 0."],
      max: [10, "Rating cannot be above 10."],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes must be 500 characters or fewer."],
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Place", placeSchema);
