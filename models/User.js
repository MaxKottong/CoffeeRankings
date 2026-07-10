const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      trim: true,
      lowercase: true,
      required: [true, "Username is required."],
      unique: true,
      maxlength: [40, "Username must be 40 characters or fewer."],
    },
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
    location: {
      type: String,
      trim: true,
      maxlength: [120, "Location must be 120 characters or fewer."],
      default: "",
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [300, "Bio must be 300 characters or fewer."],
      default: "I love coffee!",
    },
    topCoffees: {
      type: [String],
      default: [],
    },
    wantToTry: {
      type: [String],
      default: [],
    },
    profileImage: {
      data: Buffer,
      contentType: String,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

userSchema.index({ username: 1 }, { unique: true, sparse: true });
module.exports = mongoose.model("User", userSchema);
