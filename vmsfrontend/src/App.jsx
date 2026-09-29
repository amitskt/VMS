import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { trackPageView, syncUserRole } from './services/analytics.js';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Profile from './pages/volunteer/Profile.jsx';
import Skill from './pages/volunteer/Skill.jsx';
import Dashboard from './pages/volunteer/Dashboard.jsx';
import EditProfile from './pages/volunteer/EditProfile.jsx';
import MyVolunteerProfile from './pages/volunteer/MyProfile.jsx';
import VolunteerOpportunities from './pages/volunteer/Opportunities.jsx';
import OpportunityDetail from './pages/volunteer/OpportunityDetail.jsx';
import ClaimTrackA from './pages/volunteer/ClaimTrackA.jsx';
import ApplyTrackB from './pages/volunteer/ApplyTrackB.jsx';
import Confirmation from './pages/volunteer/Confirmation.jsx';
import MyApplications from './pages/volunteer/MyApplications.jsx';
import MyTasks from './pages/volunteer/MyTasks.jsx';
import Saved from './pages/volunteer/Saved.jsx';
import VolunteerCertificates from './pages/volunteer/Certificates.jsx';
import MyEngagement from './pages/volunteer/MyEngagement.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import Departments from './pages/admin/Departments.jsx';
import Settings from './pages/admin/Settings.jsx';
import Volunteers from './pages/admin/Volunteers.jsx';
import VolunteerEngagement from './pages/admin/VolunteerEngagement.jsx';
import VolunteerGroups from './pages/admin/VolunteerGroups.jsx';
import Opportunities from './pages/admin/Opportunities.jsx';
import CreateEditOpportunity from './pages/admin/CreateEditOpportunity.jsx';
import AdminApplications from './pages/admin/Applications.jsx';
import TaskBoard from './pages/admin/TaskBoard.jsx';
import AdminCertificates from './pages/admin/Certificates.jsx';
import ActivityLog from './pages/admin/ActivityLog.jsx';
import MyStaffProfile from './pages/admin/MyProfile.jsx';
import RequireAuth from './components/RequireAuth.jsx';

// Staff pages (admin + manager) — Departments.jsx/Settings.jsx further
// restrict manager access to their own content internally (the "Super
// Admin only" locked panel), so the route itself just needs "some
// logged-in staff session", not admin-only.
const STAFF_ROLES = ['admin', 'manager'];
const VOLUNTEER_ROLES = ['volunteer'];

// Fires a GA4 page_view on every route change — a client-side React Router
// navigation (Link/navigate()) never reloads index.html, so gtag's own
// automatic pageview (which only fires once, when that script first loads)
// would otherwise miss every "page" after the first. This one hook covers
// both that case and a real full-page reload (this component just remounts
// and its effect runs once, same result either way — no double-counting).
// Rendered as a sibling of <Routes/> below, inside <Router/>, since
// useLocation() only works inside a Router.
function GaPageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    syncUserRole();
    trackPageView(location.pathname + location.search, document.title);
    // location.pathname/search change on every real navigation; document.title
    // is read fresh at call time and isn't a dependency itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  return null;
}

export default function App() {
  return (
    <Router>
      <GaPageViewTracker />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/set-profile"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <Profile />
            </RequireAuth>
          }
        />
        <Route
          path="/set-skills"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <Skill />
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <Dashboard />
            </RequireAuth>
          }
        />
        {/* Real "Profile Settings" page for a volunteer who has already
            onboarded — pre-filled, editable, saves in place. /set-profile
            and /set-skills above stay as the first-time onboarding wizard
            (Profile.jsx -> Skill.jsx), unchanged. */}
        <Route
          path="/edit-profile"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <EditProfile />
            </RequireAuth>
          }
        />
        {/* Read-only "basic details" page (name/email/designation) opened
            from the new account menu (ProfileMenu.jsx) in every volunteer
            page's topbar — distinct from /edit-profile above, which is the
            full editable settings form. */}
        <Route
          path="/my-profile"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <MyVolunteerProfile />
            </RequireAuth>
          }
        />
        {/* Volunteer-facing browsing/detail pages. Named /find-opportunities
            (not /opportunities) because /opportunities is already the
            staff-side admin route below — same path, two different
            audiences, would otherwise collide. */}
        <Route
          path="/find-opportunities"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <VolunteerOpportunities />
            </RequireAuth>
          }
        />
        <Route
          path="/find-opportunities/:id"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <OpportunityDetail />
            </RequireAuth>
          }
        />

        {/* Claim (Track A) / Express Interest (Track B) / post-submit
            Confirmation, plus My Applications and Saved. */}
        <Route
          path="/claim/:id"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <ClaimTrackA />
            </RequireAuth>
          }
        />
        <Route
          path="/apply/:id"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <ApplyTrackB />
            </RequireAuth>
          }
        />
        <Route
          path="/confirmation/:id"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <Confirmation />
            </RequireAuth>
          }
        />
        <Route
          path="/my-applications"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <MyApplications />
            </RequireAuth>
          }
        />
        <Route
          path="/saved"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <Saved />
            </RequireAuth>
          }
        />
        <Route
          path="/my-tasks"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <MyTasks />
            </RequireAuth>
          }
        />
        <Route
          path="/my-certificates"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <VolunteerCertificates />
            </RequireAuth>
          }
        />
        <Route
          path="/my-engagement"
          element={
            <RequireAuth allowRoles={VOLUNTEER_ROLES}>
              <MyEngagement />
            </RequireAuth>
          }
        />

        <Route
          path="/admin-dashboard"
          element={
            <RequireAuth allowRoles={STAFF_ROLES}>
              <AdminDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/departments"
          element={
            <RequireAuth allowRoles={STAFF_ROLES}>
              <Departments />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth allowRoles={STAFF_ROLES}>
              <Settings />
            </RequireAuth>
          }
        />
        <Route
          path="/volunteers"
          element={
            <RequireAuth allowRoles={STAFF_ROLES}>
              <Volunteers />
            </RequireAuth>
          }
        />
        <Route
          path="/volunteers/:id/engagement"
          element={
            <RequireAuth allowRoles={STAFF_ROLES}>
              <VolunteerEngagement />
            </RequireAuth>
          }
        />
        <Route
          path="/volunteer-groups"
          element={
            <RequireAuth allowRoles={STAFF_ROLES}>
              <VolunteerGroups />
            </RequireAuth>
          }
        />
        <Route
          path="/opportunities"
          element={
            <RequireAuth allowRoles={STAFF_ROLES}>
              <Opportunities />
            </RequireAuth>
          }
        />
        <Route
          path="/opportunities/new"
          element={
            <RequireAuth allowRoles={STAFF_ROLES}>
              <CreateEditOpportunity />
            </RequireAuth>
          }
        />
        <Route
          path="/opportunities/:id/edit"
          element={
            <RequireAuth allowRoles={STAFF_ROLES}>
              <CreateEditOpportunity />
            </RequireAuth>
          }
        />
        <Route
          path="/applications"
          element={
            <RequireAuth allowRoles={STAFF_ROLES}>
              <AdminApplications />
            </RequireAuth>
          }
        />
        <Route
          path="/task-board"
          element={
            <RequireAuth allowRoles={STAFF_ROLES}>
              <TaskBoard />
            </RequireAuth>
          }
        />
        <Route
          path="/certificates"
          element={
            <RequireAuth allowRoles={STAFF_ROLES}>
              <AdminCertificates />
            </RequireAuth>
          }
        />
        <Route
          path="/activity-log"
          element={
            <RequireAuth allowRoles={STAFF_ROLES}>
              <ActivityLog />
            </RequireAuth>
          }
        />
        {/* Read-only "basic details" page (name/email/designation) opened
            from the new account menu (ProfileMenu.jsx) in every admin/
            manager page's topbar. */}
        <Route
          path="/profile"
          element={
            <RequireAuth allowRoles={STAFF_ROLES}>
              <MyStaffProfile />
            </RequireAuth>
          }
        />
      </Routes>
    </Router>
  );
}
