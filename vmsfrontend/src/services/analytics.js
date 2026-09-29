// Google Analytics 4 (GA4) integration — tracks every page in this app,
// public and behind login alike ("implement google analytics for both
// logged in or without log in"). GA4 only ever sees page loads in the
// browser; it has no idea about our own volunteer/staff sessions on its
// own, so this file is the bridge: on every route change (see
// <GaPageViewTracker /> in App.jsx) it fires a page_view event AND tags
// that event with whichever role is currently signed in, read from the
// same `st_role` localStorage key RequireAuth.jsx already reads (see that
// file's comment — plain localStorage, no server-side session at all).
//
// Same "silently does nothing until configured" rule as every other
// optional integration in this app (GEMINI_API_KEY, GOOGLE_DRIVE_*, AWS
// SES on the backend): if VITE_GA_MEASUREMENT_ID isn't set, index.html
// never defines window.gtag, gtagReady() below is false, and every
// exported function here just no-ops instead of throwing.

function gtagReady() {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

// Call once per route change. `path` should already include the query
// string (React Router's location.search) — GA4 treats a differing query
// string as a different "page" by default, same as a real URL change.
export function trackPageView(path, title) {
  if (!gtagReady()) return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title,
    page_location: window.location.href,
  });
}

// Re-reads `st_role` from localStorage and tags GA with it as a custom
// user property, so page_view/every later event can be filtered by role in
// GA4 reports (once `app_role` is registered as a custom dimension in the
// GA4 Admin -> Custom definitions screen — GA4 doesn't surface a custom
// user property in reports until you do that once). 'anonymous' covers
// both a visitor who never logged in and a session that just logged out —
// deliberately just the role, never a volunteer's name/email/id, so this
// stays "how many people of each kind are using the site" and never turns
// into a personal-data tracker.
export function syncUserRole() {
  if (!gtagReady()) return;
  const role = localStorage.getItem('st_role') || 'anonymous';
  window.gtag('set', 'user_properties', { app_role: role });
}
