import { useEffect, useState } from 'react';
import './ActivityLog.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Converted from admin-12-activity-log.html, wired to the real backend.
 * See Volunteers.jsx / Departments.jsx for the note on token-based auth —
 * same pattern here: Authorization: Bearer <st_token>.
 *
 * Super Admin only — same "Administration section, restricted panel for
 * Department Heads" pattern as Departments.jsx/Settings.jsx (the mockup's
 * own sidebar already hides this nav item for a 'head' role).
 *
 * There's no dedicated audit-log collection backing this — see
 * activityLogController.js's header comment for exactly which real
 * timestamp/actor field each event type is reconstructed from (and the one
 * honest approximation: Opportunity Published uses createdAt, since there's
 * no separate publishedAt field).
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/admin';
const PAGE_SIZE = 20;

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

const ROLE_SHELL = {
  super: {
    userName: 'Apurva',
    userRole: 'Super Admin',
    avatarInitial: 'A',
    roleChip: 'Super Admin · All Departments',
    showAdminSection: true,
  },
  head: {
    userName: 'Amit',
    userRole: 'Department Head · Programs',
    avatarInitial: 'V',
    roleChip: 'Department Head · Programs',
    showAdminSection: false,
  },
};

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Event Types' },
  { value: 'opp', label: 'Opportunity Published' },
  { value: 'app', label: 'Application Status Change' },
  { value: 'task', label: 'Task Assigned' },
  { value: 'approve', label: 'Task Approved' },
  { value: 'cert', label: 'Certificate Generated' },
  { value: 'dept', label: 'Department Head Assigned' },
];

const TYPE_ICON = {
  opp: '🌱',
  app: '📋',
  task: '🗂️',
  approve: '✅',
  cert: '🏅',
  dept: '🏢',
};

function groupLabel(atIso) {
  const d = new Date(atIso);
  const now = new Date();
  const startOfDay = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return 'Older';
}

function formatMeta(atIso, meta) {
  const d = new Date(atIso);
  const now = new Date();
  const group = groupLabel(atIso);

  let timeStr;
  if (group === 'Today') {
    const mins = Math.max(1, Math.round((now - d) / 60000));
    if (mins < 60) timeStr = `${mins} minute${mins === 1 ? '' : 's'} ago`;
    else {
      const hrs = Math.round(mins / 60);
      timeStr = `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
    }
  } else if (group === 'Yesterday') {
    timeStr = `Yesterday, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  } else {
    timeStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return meta ? `${timeStr} · ${meta}` : timeStr;
}

export default function ActivityLog() {
  // Role comes from the real login session — see Volunteers.jsx for the
  // full explanation of this pattern.
  const isAdmin = localStorage.getItem('st_role') === 'admin';
  const [role] = useState(isAdmin ? 'super' : 'head');
  const shell = ROLE_SHELL[role];
  const isRestricted = role === 'head';

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (isRestricted) return;

    setLoading(true);
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
    });

    const timeoutId = setTimeout(() => {
      apiRequest(`/activity-log?${query.toString()}`)
        .then((data) => {
          setEvents(data.events);
          setTotalPages(data.pages);
          setTotal(data.total);
          setError('');
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [isRestricted, search, typeFilter, page]);

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setPage(1);
  };

  // Group consecutive events under a "Today / Yesterday / Older" header,
  // same visual grouping the mockup used — computed from each event's real
  // timestamp rather than a hardcoded group field.
  const rows = [];
  let lastGroup = null;
  for (const e of events) {
    const g = groupLabel(e.at);
    if (g !== lastGroup) {
      rows.push({ kind: 'header', key: `h-${g}-${e.id}`, label: g });
      lastGroup = g;
    }
    rows.push({ kind: 'event', key: e.id, event: e });
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="dash-page page-activity-log">
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

          {shell.showAdminSection && (
            <div className="nav-section">
              <div className="nav-section-title">Administration</div>
              <a className="nav-item" href="/departments">
                <span className="icon">🏢</span>Departments
              </a>
              <a className="nav-item active" href="/activity-log">
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
            <div className="avatar">{shell.avatarInitial}</div>
            <div className="user-info">
              <div className="name">{shell.userName}</div>
              <div className="role">{shell.userRole}</div>
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
          <div className="topbar-title">Activity Log</div>
          <div className="topbar-right">
            <span className="topbar-role-chip">{shell.roleChip}</span>
            <ProfileMenu avatarInitial={shell.avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
          </div>
        </div>

        <div className="content">
          <div className="page-head">
            <div>
              <h1>Activity Log</h1>
              <p>Chronological, read-only record of system events</p>
            </div>
          </div>

          {isRestricted ? (
            <div className="restricted show">
              <div className="r-icon">🔒</div>
              <h3>Super Admin only</h3>
              <p>
                This section is only available to Super Admin accounts. Sign in with a Super
                Admin account to access it.
              </p>
            </div>
          ) : (
            <div className="section-card">
              <div className="filter-bar">
                <div className="search-wrap">
                  <span className="s-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search by volunteer or opportunity..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <select
                  className="filter-select"
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {error && <p className="form-error">{error}</p>}

              {loading ? (
                <div className="loading-state">
                  <div className="skeleton skel-row" />
                  <div className="skeleton skel-row" />
                  <div className="skeleton skel-row" />
                </div>
              ) : events.length === 0 ? (
                <div className="zero-state show">
                  <div className="zs-icon">🕓</div>
                  <h3>No activity matches your filters</h3>
                  <p>Try a different search term or clear the filters.</p>
                  <div className="zs-btns">
                    <button className="btn-ghost" onClick={clearFilters}>
                      Clear All Filters
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="log-list">
                    {rows.map((row) =>
                      row.kind === 'header' ? (
                        <div key={row.key} className="time-group">
                          {row.label}
                        </div>
                      ) : (
                        <div key={row.key} className="log-item">
                          <div className="log-icon">{TYPE_ICON[row.event.type] || '•'}</div>
                          <div className="log-body">
                            <p>
                              {row.event.actorName && <strong>{row.event.actorName}</strong>}
                              {row.event.actorName ? ' ' : ''}
                              {row.event.description}
                            </p>
                            <div className="log-meta">{formatMeta(row.event.at, row.event.meta)}</div>
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  <div className="pagination">
                    <div className="p-info">
                      Showing {rangeStart}–{rangeEnd} of {total}
                    </div>
                    <div className="p-controls">
                      <button className="p-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        ‹
                      </button>
                      <button className="p-btn active">{page}</button>
                      <button
                        className="p-btn"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        ›
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
