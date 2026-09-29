import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProfileMenu.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Shared account menu — the avatar in every page's topbar (volunteer,
 * admin, and manager alike) becomes this button. Deliberately a real
 * shared component rather than duplicated per page like the rest of the
 * admin/volunteer chrome (sidebar, topbar, apiRequest, etc.): logout has to
 * behave identically everywhere (same two localStorage keys, same
 * destination), so one implementation here means a future fix only has to
 * happen once instead of in 19 near-identical copies.
 *
 * `profilePath`: where the "Profile" item navigates — '/my-profile' for
 * volunteer pages, '/profile' for admin/manager pages (see App.jsx).
 * `avatarInitial`: whatever the calling page already shows in its avatar
 * circle (a name initial). Optional — pages that don't already load the
 * user's name (most of the volunteer side today) can omit it and get a
 * generic person glyph instead, rather than fetching a name just for this.
 * `avatarClassName`: the exact class string the page's own avatar div used
 * (e.g. "avatar avatar--sm" on the admin side, "avatar" on the volunteer
 * side) so this button inherits that page's existing avatar styling
 * exactly, with no visual change other than becoming clickable.
 *
 * PHOTO: volunteers can upload a profile photo (Profile.jsx / EditProfile.jsx
 * — stored as Volunteer.photoUrl, a base64 data URL). Only volunteer pages
 * pass an avatarInitial today rather than the photo itself, and most of
 * them (My Applications, My Tasks, Saved, Certificates, My Engagement)
 * don't load the volunteer's record at all just to fill in this one avatar.
 * So rather than pushing a photoUrl prop through all seven call sites, this
 * component fetches its own copy of /volunteer/profile once on mount, for
 * the volunteer role only (staff have no photo upload feature, so there's
 * nothing to gain fetching /admin/me here — the avatarInitial prop those
 * pages already pass is enough). Whatever this fetch returns takes over
 * from the avatarInitial prop as soon as it resolves; until then the prop
 * (or the generic glyph) is shown so there's no empty flash.
 */
export default function ProfileMenu({ avatarInitial, avatarClassName = 'avatar', profilePath }) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [fetchedInitial, setFetchedInitial] = useState(null);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('st_role') !== 'volunteer') return;
    const token = localStorage.getItem('st_token');
    fetch(`${API_BASE}/volunteer/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const user = data?.user;
        if (!user) return;
        setPhotoUrl(user.photoUrl || null);
        setFetchedInitial((user.firstName || user.email || '?').charAt(0).toUpperCase());
      })
      .catch(() => {
        // No photo available (offline, not-yet-onboarded volunteer, etc.) —
        // the avatarInitial prop / generic glyph below still renders fine.
      });
  }, []);

  // Same outside-click-close pattern as the district search dropdown
  // (admin/Volunteers.jsx) — close the panel on any click that lands
  // outside this component, not just an explicit close.
  useEffect(() => {
    if (!open) return;
    function onOutsideClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [open]);

  function goToProfile() {
    setOpen(false);
    navigate(profilePath);
  }

  function askLogout() {
    setOpen(false);
    setConfirmOpen(true);
  }

  // The only two keys Login.jsx ever writes (st_token / st_role) — see its
  // storeSession() — so clearing exactly these two is a complete logout for
  // every role (volunteer, admin, manager) alike.
  function confirmLogout() {
    localStorage.removeItem('st_token');
    localStorage.removeItem('st_role');
    navigate('/login');
  }

  const initial = fetchedInitial || avatarInitial || '👤';

  return (
    <div className="profile-menu" ref={wrapRef}>
      <button
        type="button"
        className={avatarClassName}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {photoUrl ? <img className="pm-avatar-img" src={photoUrl} alt="" /> : initial}
      </button>

      {open && (
        <div className="profile-menu-panel" role="menu">
          <button type="button" className="profile-menu-item" role="menuitem" onClick={goToProfile}>
            <span className="pm-icon">👤</span> Profile
          </button>
          <button
            type="button"
            className="profile-menu-item profile-menu-item--danger"
            role="menuitem"
            onClick={askLogout}
          >
            <span className="pm-icon">🚪</span> Logout
          </button>
        </div>
      )}

      {confirmOpen && (
        <div className="pm-modal-overlay show" onClick={() => setConfirmOpen(false)}>
          <div className="pm-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Log out?</h3>
            <p>Are you sure you want to logout?</p>
            <div className="pm-modal-btns">
              <button type="button" className="pm-btn-cancel" onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className="pm-btn-confirm" onClick={confirmLogout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
