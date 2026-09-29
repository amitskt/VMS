import { useEffect, useState } from 'react';
import './AdminDashboard.css';
import { Link } from 'react-router-dom';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Converted from admin-02-dashboard.html, wired to the real backend. Used
 * to switch between two hardcoded personas (Apurva / Vikram Suri) keyed
 * only by role — now fetches GET /api/admin/dashboard-summary
 * (adminDashboardController.js), which resolves the actual logged-in
 * staff member's name/department and computes every stat + recent-activity
 * row from the real Opportunity/Application/Task collections, scoped to
 * the manager's own department exactly like every other admin page here.
 * See Volunteers.jsx / Departments.jsx for the note on token-based auth —
 * same pattern here: Authorization: Bearer <st_token>.
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

// Track B statuses -> how the Recent Applications row renders. Reused for
// both the dot color class and the status chip — 'selected' as a CSS class
// name predates this app dropping the actual 'selected' status (see
// Application.js's header comment), kept here purely as the green
// "further along" color for task_assigned/completed, never as a real
// status value.
const APP_STATUS_META = {
  under_review: { label: 'Under Review', dot: 'review', chip: 'status-review' },
  shortlisted: { label: 'Shortlisted', dot: 'shortlisted', chip: 'status-shortlist' },
  task_assigned: { label: 'Task Assigned', dot: 'selected', chip: 'status-taskassigned' },
  completed: { label: 'Completed', dot: 'selected', chip: 'status-selected' },
  not_selected: { label: 'Not Selected', dot: 'notselected', chip: 'status-notselected' },
  withdrawn: { label: 'Withdrawn', dot: 'withdrawn', chip: 'status-withdrawn' },
};

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function Dashboard() {
  // Role comes from the real login session — Login.jsx writes 'admin' or
  // 'manager' to localStorage as `st_role` after a successful staff sign-in.
  const isAdmin = localStorage.getItem('st_role') === 'admin';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest('/dashboard-summary')
      .then((data) => {
        setSummary(data);
        setError('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Everything the old DASHBOARD_DATA object hardcoded per-role is now
  // derived from the real summary response.
  const name = summary?.name || (isAdmin ? 'Admin' : 'Department Head');
  const firstName = name.split(' ')[0];
  const avatarInitial = (name.charAt(0) || (isAdmin ? 'A' : 'D')).toUpperCase();
  const showAdminSection = summary ? summary.role === 'admin' : isAdmin;
  const userRole = summary
    ? summary.role === 'admin'
      ? 'Super Admin'
      : `Department Head · ${summary.department}`
    : '';
  const roleChip = summary
    ? summary.role === 'admin'
      ? 'Super Admin · All Departments'
      : `Department Head · ${summary.department}`
    : '';
  const snapshotDept = summary ? (summary.role === 'admin' ? 'all departments' : summary.department) : '';
  const welcomeSub = summary
    ? summary.role === 'admin'
      ? "Here's what needs your attention across all departments today."
      : `Here's what needs your attention in ${summary.department} today.`
    : '';

  const stats = summary?.stats || { pendingApps: 0, tasksReview: 0, certsMonth: 0, activeOpps: 0 };
  const navBadges = { applications: stats.pendingApps, tasks: stats.tasksReview };
  const recentApplications = summary?.recentApplications || [];
  const recentTasks = summary?.recentTasks || [];

  return (
    <div className="dash-page page-dashboard">
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
            <Link className="nav-item active" to="/admin-dashboard">
              <span className="icon">🏠</span>Dashboard
            </Link>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Opportunities</div>
            <a className="nav-item" href="/opportunities">
              <span className="icon">🌱</span>Opportunities
            </a>
            <a className="nav-item" href="/applications">
              <span className="icon">📋</span>Applications{' '}
              <span className="badge">{navBadges.applications}</span>
            </a>
            <a className="nav-item" href="/task-board">
              <span className="icon">🗂️</span>Task Board <span className="badge">{navBadges.tasks}</span>
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

          {showAdminSection && (
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
              <div className="role">{userRole}</div>
            </div>
          </div>
        </div>
      </aside>

      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* MAIN */}
      <div className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div className="topbar-title">Dashboard</div>
          <div className="topbar-right">
            <span className="topbar-role-chip">{roleChip}</span>
            <ProfileMenu avatarInitial={avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
          </div>
        </div>

        <div className="content">
          {error && <p className="form-error">{error}</p>}

          {/* WELCOME STRIP */}
          <div className="welcome-card">
            <h2>{loading ? 'Welcome back 👋' : `Welcome back, ${firstName} 👋`}</h2>
            <p>{loading ? 'Loading your dashboard…' : welcomeSub}</p>
          </div>

          {/* STAT GRID */}
          <div className="stat-grid">
            <div className="stat-card" onClick={() => (window.location.href = '/applications')}>
              <div className="s-icon">📋</div>
              <div className="s-num">{loading ? '—' : stats.pendingApps}</div>
              <div className="s-label">Pending Applications</div>
            </div>
            <div className="stat-card" onClick={() => (window.location.href = '/task-board')}>
              <div className="s-icon">🗂️</div>
              <div className="s-num">{loading ? '—' : stats.tasksReview}</div>
              <div className="s-label">Tasks Awaiting Review</div>
            </div>
            <div className="stat-card" onClick={() => (window.location.href = '/certificates')}>
              <div className="s-icon">🏅</div>
              <div className="s-num">{loading ? '—' : stats.certsMonth}</div>
              <div className="s-label">Certificates Issued This Month</div>
            </div>
            <div className="stat-card" onClick={() => (window.location.href = '/opportunities')}>
              <div className="s-icon">🌱</div>
              <div className="s-num">{loading ? '—' : stats.activeOpps}</div>
              <div className="s-label">Active Opportunities</div>
            </div>
          </div>

          {/* MAIN GRID */}
          <div className="dash-grid">
            {/* LEFT: Recent Applications + Recent Task Submissions */}
            <div>
              <div className="section-card">
                <h3>
                  Recent Applications <a href="/applications">See all →</a>
                </h3>
                {loading ? (
                  <div className="loading-state">
                    <div className="skeleton skel-row" />
                    <div className="skeleton skel-row" />
                  </div>
                ) : recentApplications.length === 0 ? (
                  <div className="empty-state">
                    <div className="e-icon">📋</div>
                    <p>No recent applications.</p>
                  </div>
                ) : (
                  recentApplications.map((app) => {
                    const meta = APP_STATUS_META[app.status] || {
                      label: app.status,
                      dot: 'review',
                      chip: 'status-review',
                    };
                    return (
                      <div
                        key={app.id}
                        className="app-item"
                        onClick={() => (window.location.href = '/applications')}
                      >
                        <div className={`app-dot ${meta.dot}`}></div>
                        <div className="app-body">
                          <h4>
                            {app.volunteerName} — {app.opportunityTitle}
                          </h4>
                          <div className="app-meta">
                            <span className="track-chip track-b">Track B</span>
                            <span className={`status-chip ${meta.chip}`}>{meta.label}</span>
                            <span className="app-dept">{app.dept}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="section-card">
                <h3>
                  Recent Task Submissions <a href="/task-board">See all →</a>
                </h3>
                {loading ? (
                  <div className="loading-state">
                    <div className="skeleton skel-row" />
                  </div>
                ) : recentTasks.length === 0 ? (
                  <div className="empty-state">
                    <div className="e-icon">🗂️</div>
                    <p>No task submissions yet.</p>
                  </div>
                ) : (
                  recentTasks.map((task) => (
                    <div
                      key={task.id}
                      className="task-item"
                      onClick={() => (window.location.href = '/task-board')}
                    >
                      <div className="task-check"></div>
                      <div className="task-body">
                        <h4>{task.title}</h4>
                        <p>
                          {task.volunteerName} · Submitted {timeAgo(task.submittedAt)}
                        </p>
                      </div>
                      <div className="task-due">Review</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* RIGHT: Quick Links + Department Snapshot */}
            <div>
              <div className="section-card">
                <h3>Quick Links</h3>
                <a className="quick-link" href="/opportunities">
                  <div className="q-icon">🌱</div>
                  <div>
                    <div className="q-label">Opportunities</div>
                    <div className="q-sub">Create or manage listings</div>
                  </div>
                </a>
                <a className="quick-link" href="/applications">
                  <div className="q-icon">📋</div>
                  <div>
                    <div className="q-label">Applications</div>
                    <div className="q-sub">Review Track B pipeline</div>
                  </div>
                </a>
                <a className="quick-link" href="/task-board">
                  <div className="q-icon">🗂️</div>
                  <div>
                    <div className="q-label">Task Board</div>
                    <div className="q-sub">Assign and review work</div>
                  </div>
                </a>
              </div>

              <div className="section-card">
                <h3>Department Snapshot</h3>
                <div className="snapshot-text">
                  {loading
                    ? 'Loading…'
                    : `${summary.departmentsCount} departments active · `}
                  {!loading && <strong>{snapshotDept}</strong>}
                  {!loading && ' shown for your role.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
