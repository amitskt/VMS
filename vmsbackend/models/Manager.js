const mongoose = require('mongoose');

const DEPARTMENTS = [
  'IT',
  'Programs',
  'Operations',
  'Impact Reporting',
  'Design & Innovation',
  'Patron Care',
];

const managerSchema = new mongoose.Schema(
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

    role: { type: String, default: 'manager', immutable: true },

    // ONE department per person — changed from an array to a single enum
    // value per the "one person, one department" rule.
    department: {
      type: String,
      enum: DEPARTMENTS,
      required: true,
    },

    // Set only by departmentController.assignDepartmentHead — deliberately
    // NOT touched by createManager (a brand-new manager's initial
    // department is "account created with department X", not "assigned as
    // department head") or toggleManagerStatus. This is what the Activity
    // Log's "Department Head Assigned" events are built from (see
    // controllers/activityLogController.js) — using `updatedAt` instead
    // would have been wrong, since that also changes on an isActive toggle.
    departmentAssignedAt: { type: Date, default: null },
    departmentAssignedByRole: { type: String, enum: ['admin', 'manager'] },
    departmentAssignedById: { type: mongoose.Schema.Types.ObjectId },

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

managerSchema.statics.DEPARTMENTS = DEPARTMENTS;

module.exports = mongoose.model('Manager', managerSchema);
