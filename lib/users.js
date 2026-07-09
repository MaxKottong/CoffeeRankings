const crypto = require("crypto");

// Authorized accounts allowed to submit, edit, and delete places.
const USERS = [
  { email: "max.kottong@gmail.com", password: "C@t@c1y5m1c" },
  { email: "margaretmclean1@me.com", password: "B!ackd0g123" },
];

// Constant-time comparison to avoid leaking info via timing.
function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyUser(email, password) {
  const normalized = String(email || "").trim().toLowerCase();
  const user = USERS.find((u) => u.email.toLowerCase() === normalized);
  if (!user) return null;
  if (!safeEqual(user.password, password || "")) return null;
  return { email: user.email };
}

module.exports = { USERS, verifyUser };
