import { Navigate, useLocation } from 'react-router-dom';

const STAFF_ROLES = ['admin', 'manager'];

// Where to send someone who IS logged in, but isn't allowed on the route
// they just tried to open directly (e.g. a volunteer typing in
// /admin-dashboard, or a staff member typing in /set-profile).
function landingPathForRole(role) {
  if (STAFF_ROLES.includes(role)) return '/admin-dashboard';
  if (role === 'volunteer') return '/dashboard';
  return '/login';
}

/**
 * Route guard for App.jsx. Before this existed, every route (including
 * /admin-dashboard, /departments, /settings, /volunteers, /set-profile,
 * /set-skills, /dashboard) rendered unconditionally — opening any of those URLs in a
 * fresh browser with no session at all still showed the full page. This
 * wraps a route element and only renders it once there's a real session in
 * localStorage (written by Login.jsx as `st_token` / `st_role` after a
 * real volunteer or staff sign-in).
 *
 * NOTE ON SECURITY: this is a client-side UX guard only — it stops the page
 * from rendering, but someone could still edit localStorage by hand to get
 * past it. That's fine, because it isn't the real security boundary: every
 * admin/manager API call already goes through the backend's `protect` +
 * `requireRole` middleware, which verifies the JWT signature server-side
 * regardless of what the browser's localStorage says. This guard's job is
 * just to stop an unauthenticated page from rendering client-side at all
 * (and to send the wrong role somewhere sensible instead of a blank/broken
 * screen), not to be the thing standing between an attacker and real data.
 *
 * `allowRoles`: which `st_role` values may view this route.
 */
export default function RequireAuth({ allowRoles, children }) {
  const location = useLocation();
  const token = localStorage.getItem('st_token');
  const role = localStorage.getItem('st_role');

  if (!token || !role) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowRoles && !allowRoles.includes(role)) {
    return <Navigate to={landingPathForRole(role)} replace />;
  }

  return children;
}
