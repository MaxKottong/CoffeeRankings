const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: [true, "Name is required."],
      maxlength: [80, "Name must be 80 characters or fewer."],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: [true, "Email is required."],
      unique: true,
      index: true,
      maxlength: [160, "Email must be 160 characters or fewer."],
    },
    passwordHash: {
      type: String,
      required: true,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
