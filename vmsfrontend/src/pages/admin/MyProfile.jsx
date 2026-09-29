import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ProfileMenu from '../../components/ProfileMenu.jsx';
import './AdminShell.css';
import './MyProfile.css';

/**
 * "Profile" — reached from the new account menu (ProfileMenu.jsx) in every
 * admin/manager page's topbar, not from the sidebar nav itself. Shows the
 * three basic details asked for: name, email, and designation (Admin, or
 * Department Head/Manager with their department). Deliberately a plain
 * read-only view, not another copy of Settings.jsx's account-editing form —
 * if in-place editing is ever wanted here later, this is the page to extend.
 *
 * GET /api/admin/me (adminDashboardController.getMyProfile) is a small,
 * dedicated endpoint added alongside dashboard-summary specifically for
 * this page — dashboard-summary already resolves name/department the same
 * way but also computes a full dashboard's worth of stats this page has no
 * use for, and it didn't return email at all until now.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/admin';

async function apiRequest(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('st_token')}`,
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export default function MyProfile() {
  const navigate = useNavigate();
  const isAdmin = localStorage.getItem('st_role') === 'admin';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest('/me')
      .then((data) => {
        setMe(data);
        setError('');
      })
      .catch((err) => setError(err.message || 'Could not load your profile.'))
      .finally(() => setLoading(false));
  }, []);

  const name = me?.name || (isAdmin ? 'Admin' : 'Department Head');
  const avatarInitial = (name.charAt(0) || (isAdmin ? 'A' : 'D')).toUpperCase();
  const designation = me
    ? me.role === 'admin'
      ? 'Super Admin'
      : `Department Head (Manager) · ${me.department || '—'}`
    : '';
  const roleChip = me
    ? me.role === 'admin'
      ? 'Super Admin · All Departments'
      : `Department Head · ${me.department || ''}`
    : '';

  return (
    <div className="dash-page page-my-profile">
      {/* SIDEBAR */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-wrap">
            <div className="logo-lockup">
              <span className="logo-word">STart</span>
              <span className="logo-sub">by SankalpTaru</span>
            </div>
            <span className="logo-badge">{isAdmin ? 'Admin' : 'Manager'}</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">Overview</div>
            <a className="nav-item" href="/admin-dashboard">
              <span className="icon">🏠</span>Dashboard
            </a>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Opportunities</div>
            <a className="nav-item" href="/opportunities">
              <span className="icon">🌱</span>Opportunities
            </a>
            <a className="nav-item" href="/applications">
              <span className="icon">📋</span>Applications
            </a>
            <a className="nav-item" href="/task-board">
              <span className="icon">🗂️</span>Task Board
            </a>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Volunteers</div>
            <a className="nav-item" href="/volunteers">
              <span className="icon">👥</span>Volunteers
            </a>
            <a className="nav-item" href="/volunteer-groups">
              <span className="icon">📍</span>Volunteer Groups
            </a>
            <a className="nav-item" href="/certificates">
              <span className="icon">🏅</span>Certificates
            </a>
          </div>

          {isAdmin && (
            <div className="nav-section">
              <div className="nav-section-title">Administration</div>
              <a className="nav-item" href="/departments">
                <span className="icon">🏢</span>Departments
              </a>
              <a className="nav-item" href="/activity-log">
                <span className="icon">🕓</span>Activity Log
              </a>
              <a className="nav-item" href="/settings">
                <span className="icon">⚙️</span>Settings
              </a>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="avatar">{avatarInitial}</div>
            <div className="user-info">
              <div className="name">{name}</div>
              <div className="role">{roleChip}</div>
            </div>
          </div>
        </div>
      </aside>

      <div className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* MAIN */}
      <div className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div className="topbar-title">My Profile</div>
          <div className="topbar-right">
            <ProfileMenu avatarInitial={avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
          </div>
        </div>

        <div className="content">
          <button className="back-link" onClick={() => navigate(-1)}>
            ← Back
          </button>

          {loading ? (
            <div className="empty-state">
              <div className="e-icon">👤</div>
              <p>Loading your profile…</p>
            </div>
          ) : error ? (
            <p className="form-error">{error}</p>
          ) : (
            <div className="profile-card">
              <div className="profile-avatar">{avatarInitial}</div>
              <div className="profile-fields">
                <div className="profile-field">
                  <div className="pf-label">Name</div>
                  <div className="pf-value">{name}</div>
                </div>
                <div className="profile-field">
                  <div className="pf-label">Email</div>
                  <div className="pf-value">{me?.email || '—'}</div>
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
