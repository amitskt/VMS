const mongoose = require('mongoose');

// Admins, like managers, never register themselves. The very first admin is
// created directly in the database (see seed/seedStaff.js); every admin after
// that can be added by an existing admin through an internal tool. Sign-in is
// Google-only, restricted to the sankalptaru.org domain.
const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      validate: {
        validator: (v) => v.endsWith(`@${process.env.STAFF_DOMAIN || 'sankalptaru.org'}`),
        message: (props) => `${props.value} is not a valid staff (sankalptaru.org) email.`,
      },
    },
    googleId: { type: String, index: true, sparse: true },

    role: { type: String, default: 'admin', immutable: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Admin', adminSchema);
