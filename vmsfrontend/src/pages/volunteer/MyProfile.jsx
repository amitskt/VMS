import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from './api';
import ProfileMenu from '../../components/ProfileMenu.jsx';
import './VolunteerShell.css';
import './MyProfile.css';

/**
 * "Profile" — reached from the new account menu (ProfileMenu.jsx) in every
 * volunteer page's topbar. Shows the three basic details asked for: name,
 * email, and designation ("Volunteer" for everyone on this side, but shown
 * from the real record rather than hardcoded in case that ever changes).
 * Deliberately a plain read-only view — Profile Settings (/edit-profile)
 * already covers editing everything else (phone, district, resume, etc.).
 *
 * Reuses GET /volunteer/profile — the same endpoint Dashboard.jsx and
 * EditProfile.jsx already call — rather than adding a new backend route,
 * since toPublicVolunteer() already returns email/firstName/lastName/role.
 */
export default function MyProfile() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet('/volunteer/profile')
      .then((data) => {
        setUser(data.user);
        setError('');
      })
      .catch((err) => setError(err.message || 'Could not load your profile.'))
      .finally(() => setLoading(false));
  }, []);

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || '(no name yet)';
  const avatarInitial = (user?.firstName || user?.email || '?').charAt(0).toUpperCase();
  const designation = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Volunteer';

  return (
    <div className="volunteer-shell page-my-profile">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-wrap">
            <div className="logo-lockup">
              <span className="logo-word">STart</span>
              <span className="logo-sub">by SankalpTaru</span>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">Main</div>
            <a className="nav-item" onClick={() => navigate('/dashboard')}><span className="icon">🏠</span>Dashboard</a>
            <a className="nav-item" onClick={() => navigate('/find-opportunities')}><span className="icon">🔍</span>Opportunities</a>
          </div>
          <div className="nav-section">
            <div className="nav-section-title">My Volunteering</div>
            <a className="nav-item" onClick={() => navigate('/my-applications')}><span className="icon">📋</span>My Applications</a>
            <a className="nav-item" onClick={() => navigate('/my-tasks')}><span className="icon">✅</span>My Tasks</a>
            <a className="nav-item" onClick={() => navigate('/saved')}><span className="icon">🔖</span>Saved</a>
          </div>
          <div className="nav-section">
            <div className="nav-section-title">Progress</div>
            <a className="nav-item" onClick={() => navigate('/my-engagement')}><span className="icon">📊</span>My Engagement</a>
            <a className="nav-item" onClick={() => navigate('/my-certificates')}><span className="icon">🏅</span>Certificates</a>
          </div>
          <div className="nav-section">
            <div className="nav-section-title">Account</div>
            <a className="nav-item active"><span className="icon">👤</span>My Profile</a>
            <a className="nav-item" onClick={() => navigate('/edit-profile')}><span className="icon">⚙️</span>Profile Settings</a>
          </div>
        </nav>
      </aside>
      <div className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
          <div className="topbar-title">👤 My Profile</div>
          <div className="topbar-right">
            <ProfileMenu avatarInitial={avatarInitial} avatarClassName="avatar" profilePath="/my-profile" />
          </div>
        </div>

        <div className="content">
          <button className="back-link" onClick={() => navigate(-1)}>← Back</button>

          {loading ? (
            <div className="empty-state"><div className="e-icon">👤</div><p>Loading your profile…</p></div>
          ) : error ? (
            <p className="form-error">{error}</p>
          ) : (
            <div className="profile-card">
              <div className="profile-avatar">{user?.photoUrl ? <img className="pa-photo" src={user.photoUrl} alt="" /> : avatarInitial}</div>
              <div className="profile-fields">
                <div className="profile-field">
                  <div className="pf-label">Name</div>
                  <div className="pf-value">{name}</div>
                </div>
                <div className="profile-field">
                  <div className="pf-label">Email</div>
                  <div className="pf-value">{user?.email || '—'}</div>
                </div>
                <div className="profile-field">
                  <div className="pf-label">Designation</div>
                  <div className="pf-value">{designation}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
