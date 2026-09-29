require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');

const volunteerAuthRoutes = require('./routes/volunteerAuthRoutes');
const staffAuthRoutes = require('./routes/staffAuthRoutes');
const volunteerRoutes = require('./routes/volunteerRoutes');
const meRoutes = require('./routes/meRoutes');
const adminRoutes = require('./routes/adminRoutes');
const dashboardAdminRoutes = require('./routes/dashboardAdminRoutes');
const volunteersAdminRoutes = require('./routes/volunteersAdminRoutes');
const opportunitiesAdminRoutes = require('./routes/opportunitiesAdminRoutes');
const applicationsAdminRoutes = require('./routes/applicationsAdminRoutes');
const tasksAdminRoutes = require('./routes/tasksAdminRoutes');
const certificatesAdminRoutes = require('./routes/certificatesAdminRoutes');
const publicRoutes = require('./routes/publicRoutes');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(cookieParser()); // <-- ADDED: run `npm install cookie-parser` if not already present
// Raised from Express's 100kb default — Profile.jsx sends the photo as a
// base64 data URL (up to ~5MB source image => larger once base64-encoded).
app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Public, unauthenticated data for the landing page (Home.jsx) — no JWT,
// since a visitor hasn't logged in yet. See routes/publicRoutes.js.
app.use('/api/public', publicRoutes);

app.use('/api/auth/volunteer', volunteerAuthRoutes);
app.use('/api/auth/staff', staffAuthRoutes);
app.use('/api/volunteer', volunteerRoutes);
app.use('/api', meRoutes);
// volunteersAdminRoutes is mounted BEFORE adminRoutes: it allows admin OR
// manager, while adminRoutes.js gates the whole file to admin only. Express
// tries routers in registration order, so a manager hitting /volunteers
// matches here first; anything unmatched (e.g. /managers) falls through to
// adminRoutes.js's stricter check as normal.
// dashboardAdminRoutes is also admin-OR-manager, same reasoning as
// volunteersAdminRoutes above — mounted before adminRoutes so a manager's
// request reaches this broader gate first.
app.use('/api/admin', dashboardAdminRoutes);
// opportunitiesAdminRoutes is also admin-OR-manager, same reasoning as
// volunteersAdminRoutes above — mounted before adminRoutes so a manager's
// request reaches this broader gate first.
app.use('/api/admin', volunteersAdminRoutes);
app.use('/api/admin', opportunitiesAdminRoutes);
// applicationsAdminRoutes is also admin-OR-manager, same reasoning as the
// two routers above — mounted before adminRoutes so a manager's request
// reaches this broader gate first.
app.use('/api/admin', applicationsAdminRoutes);
// tasksAdminRoutes is also admin-OR-manager, same reasoning as the routers
// above — mounted before adminRoutes so a manager's request reaches this
// broader gate first.
app.use('/api/admin', tasksAdminRoutes);
// certificatesAdminRoutes is also admin-OR-manager, same reasoning as the
// routers above — mounted before adminRoutes so a manager's request reaches
// this broader gate first.
app.use('/api/admin', certificatesAdminRoutes);
app.use('/api/admin', adminRoutes);

// 404
app.use((req, res) => res.status(404).json({ message: 'Not found.' }));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error.' });
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`[server] Listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('[server] Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
