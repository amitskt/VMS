import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Opportunities.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Converted from admin-03-opportunities.html, wired to the real backend
 * (controllers/opportunityController.js, routes/opportunitiesAdminRoutes.js)
 * — replaces the earlier frontend-only pass that used an in-memory mock
 * (opportunitiesData.js is no longer imported here; it can be deleted).
 * See Volunteers.jsx / Settings.jsx for the note on token-based auth — same
 * pattern here: Authorization: Bearer <st_token>.
 *
 * DEPARTMENT SCOPING: a Department Head (manager) only ever sees
 * opportunities owned by their own department — enforced server-side in
 * opportunityController.js, not just hidden in the UI. The department
 * filter dropdown is hidden for managers since there's nothing to filter
 * (the backend already scoped the list before it got here). Super Admin
 * sees and can filter across everything. See CreateEditOpportunity.jsx for
 * the create/edit side of this rule.
 *
 * The manager's real department (`myDepartment`) comes from
 * GET /opportunities/meta, which looks it up server-side from the Manager
 * collection — no more hardcoded placeholder.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/admin';
const PAGE_SIZE = 10;

async function apiRequest(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('st_token')}`,
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

const TRACK_LABEL = { a: 'Track A', b: 'Track B' };
const STATUS_LABEL = { active: 'Active', draft: 'Draft', deactivated: 'Deactivated', archived: 'Archived' };

export default function Opportunities() {
  const navigate = useNavigate();

  // Role comes from the real login session — see Volunteers.jsx / Settings.jsx
  // for the note on why this reads `st_role` instead of a `?role=` URL param.
  const isAdmin = localStorage.getItem('st_role') === 'admin';
  const isManager = !isAdmin;

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // departments/skills/modes + the resolved manager department, from the
  // backend's /opportunities/meta — nothing here is hardcoded.
  const [meta, setMeta] = useState({ departments: [], myDepartment: null });

  const [search, setSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    apiRequest('/opportunities/meta')
      .then(setMeta)
      .catch(() => {
        /* non-fatal — the department filter/labels just stay generic if this fails */
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(trackFilter !== 'all' ? { track: trackFilter } : {}),
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      ...(!isManager && deptFilter !== 'all' ? { department: deptFilter } : {}),
    });

    // Small debounce so fast typing in the search box doesn't fire a
    // request per keystroke — same pattern as Volunteers.jsx.
    const timeoutId = setTimeout(() => {
      apiRequest(`/opportunities?${query.toString()}`)
        .then((data) => {
          setOpportunities(data.opportunities);
          setTotalPages(data.pages);
          setTotal(data.total);
          setError('');
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search, trackFilter, statusFilter, deptFilter, page, isManager]);

  const clearFilters = () => {
    setSearch('');
    setTrackFilter('all');
    setStatusFilter('all');
    setDeptFilter('all');
    setPage(1);
  };

  const reload = () => {
    setLoading(true);
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(trackFilter !== 'all' ? { track: trackFilter } : {}),
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      ...(!isManager && deptFilter !== 'all' ? { department: deptFilter } : {}),
    });
    apiRequest(`/opportunities?${query.toString()}`)
      .then((data) => {
        setOpportunities(data.opportunities);
        setTotalPages(data.pages);
        setTotal(data.total);
        setError('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const handleToggleStatus = async (id) => {
    try {
      await apiRequest(`/opportunities/${id}/toggle-status`, { method: 'PATCH' });
      reload();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleArchive = async (id) => {
    try {
      await apiRequest(`/opportunities/${id}/archive`, { method: 'PATCH' });
      reload();
    } catch (err) {
      alert(err.message);
    }
  };

  const shell = isAdmin
    ? {
        userName: 'Apurva',
        userRole: 'Super Admin',
        avatarInitial: 'A',
        roleChip: 'Super Admin · All Departments',
        showAdminSection: true,
      }
    : {
        userName: 'Amit',
        userRole: `Department Head${meta.myDepartment ? ` · ${meta.myDepartment}` : ''}`,
        avatarInitial: 'V',
        roleChip: `Department Head${meta.myDepartment ? ` · ${meta.myDepartment}` : ''}`,
        showAdminSection: false,
      };

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="dash-page page-opportunities">
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
            <a className="nav-item active" href="/opportunities">
              <span className="icon">🌱</span>Opportunities
            </a>
            <a className="nav-item" href="/applications">
              <span className="icon">📋</span>Applications <span className="badge">7</span>
            </a>
            <a className="nav-item" href="/task-board">
              <span className="icon">🗂️</span>Task Board <span className="badge">4</span>
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
          <button
            className="menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="topbar-title">Opportunities</div>
          <div className="topbar-right">
            <span className="topbar-role-chip">{shell.roleChip}</span>
            <ProfileMenu avatarInitial={shell.avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
          </div>
        </div>

        <div className="content">
          <div className="page-head">
            <div>
              <h1>Opportunities</h1>
              <p>
                {isManager
                  ? `Opportunities owned by ${meta.myDepartment || 'your department'}`
                  : 'Track A & Track B catalogue shown on the Volunteer Portal'}
              </p>
            </div>
            <button className="btn-primary" onClick={() => navigate('/opportunities/new')}>
              + Create Opportunity
            </button>
          </div>

          <div className="section-card">
            <div className="filter-bar">
              <div className="search-wrap">
                <span className="s-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search opportunities by title..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <select
                className="filter-select"
                value={trackFilter}
                onChange={(e) => {
                  setTrackFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All Tracks</option>
                <option value="a">Track A</option>
                <option value="b">Track B</option>
              </select>

              <select
                className="filter-select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="deactivated">Deactivated</option>
                <option value="archived">Archived</option>
              </select>

              {!isManager && (
                <select
                  className="filter-select"
                  value={deptFilter}
                  onChange={(e) => {
                    setDeptFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">All Departments</option>
                  {meta.departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {isManager && (
              <div className="filter-note">
                Showing opportunities owned by <strong>{meta.myDepartment || '…'}</strong>
              </div>
            )}

            {error && <p className="form-error">{error}</p>}

            {loading ? (
              <div className="loading-state">
                <div className="skeleton skel-row" />
                <div className="skeleton skel-row" />
                <div className="skeleton skel-row" />
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Opportunity</th>
                      <th>Track</th>
                      <th>Department(s)</th>
                      <th>Status</th>
                      <th>Applications</th>
                      <th>Capacity</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.map((o) => {
                      const canArchive = o.apps === 0 && o.status !== 'archived';
                      const toggleLabel = o.status === 'deactivated' ? 'Reactivate' : 'Deactivate';
                      const toggleClass = o.status === 'deactivated' ? '' : 'warn';
                      return (
                        <tr key={o.id}>
                          <td data-label="Opportunity">
                            <div className="opp-title-row">
                              <span className="opp-title">{o.title}</span>
                              <span className="opp-created">
                                Created {new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                          </td>
                          <td data-label="Track">
                            <span className={`track-chip track-${o.track}`}>{TRACK_LABEL[o.track]}</span>
                          </td>
                          <td data-label="Department(s)">
                            {o.depts.map((d) => (
                              <span key={d} className="dept-chip">
                                {d}
                              </span>
                            ))}
                          </td>
                          <td data-label="Status">
                            <span className={`status-chip status-${o.status}`}>{STATUS_LABEL[o.status]}</span>
                          </td>
                          <td data-label="Applications">{o.apps.toLocaleString()}</td>
                          <td data-label="Capacity">{o.capacity || 'Unlimited'}</td>
                          <td data-label="Actions">
                            <div className="row-actions">
                              <button className="btn-ghost" onClick={() => navigate(`/opportunities/${o.id}/edit`)}>
                                Edit
                              </button>
                              <button className={`btn-ghost ${toggleClass}`} onClick={() => handleToggleStatus(o.id)}>
                                {toggleLabel}
                              </button>
                              <button
                                className="btn-ghost"
                                disabled={!canArchive}
                                title={canArchive ? undefined : 'Resolve open applications before archiving'}
                                onClick={() => handleArchive(o.id)}
                              >
                                Archive
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {opportunities.length === 0 && (
                  <div className="zero-state show">
                    <div className="zs-icon">🪴</div>
                    <h3>No matching opportunities</h3>
                    <p>We couldn't find any opportunities matching your filters. Try broadening your search or clearing the filters.</p>
                    <div className="zs-btns">
                      <button className="btn-ghost" onClick={clearFilters}>
                        Clear All Filters
                      </button>
                    </div>
                  </div>
                )}

                {opportunities.length > 0 && (
                  <div className="pagination">
                    <div className="p-info">
                      Showing {rangeStart}–{rangeEnd} of {total}
                    </div>
                    <div className="p-controls">
                      <button className="p-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        ‹
                      </button>
                      <button className="p-btn active">{page}</button>
                      <button className="p-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                        ›
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
