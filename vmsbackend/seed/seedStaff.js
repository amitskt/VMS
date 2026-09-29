// Run with: npm run seed:staff
// Provisions the initial Manager/Admin records so they can sign in with
// Google. Edit the arrays below with real @sankalptaru.org emails first.

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Admin = require('../models/Admin');
const Manager = require('../models/Manager');

const ADMINS_TO_SEED = [
  { name: 'Super Admin', email: `admin@${process.env.STAFF_DOMAIN || 'sankalptaru.org'}` },
];

const MANAGERS_TO_SEED = [
  { name: 'Volunteer Manager', email: `manager@${process.env.STAFF_DOMAIN || 'sankalptaru.org'}` },
];

async function run() {
  await connectDB();

  for (const admin of ADMINS_TO_SEED) {
    const existing = await Admin.findOne({ email: admin.email.toLowerCase() });
    if (existing) {
      console.log(`[seed] Admin already exists: ${admin.email}`);
      continue;
    }
    await Admin.create({ name: admin.name, email: admin.email.toLowerCase() });
    console.log(`[seed] Created admin: ${admin.email}`);
  }

  for (const manager of MANAGERS_TO_SEED) {
    const existing = await Manager.findOne({ email: manager.email.toLowerCase() });
    if (existing) {
      console.log(`[seed] Manager already exists: ${manager.email}`);
      continue;
    }
    await Manager.create({ name: manager.name, email: manager.email.toLowerCase() });
    console.log(`[seed] Created manager: ${manager.email}`);
  }

  await mongoose.disconnect();
  console.log('[seed] Done.');
}

run().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
