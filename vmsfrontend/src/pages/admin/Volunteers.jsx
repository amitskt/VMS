import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Volunteers.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Converted from admin-06-volunteers.html, wired to the real backend.
 * See Settings.jsx / Departments.jsx for the note on token-based auth —
 * same pattern here: Authorization: Bearer <st_token>.
 *
 * Every column is real data from the Volunteer collection (name, email,
 * district, engagement, registered date), plus Certificates/Hours computed
 * server-side from Applications/Tasks — see volunteerAdminController.js's
 * listVolunteers for exactly how.
 *
 * Uses the volunteer's `district` field (not `cityTown`) for the location
 * column and its filter — matches volunteerAdminController.js, which
 * queries/aggregates on `district`. The district filter is a searchable
 * dropdown (not a plain <select>) since the district list can get long.
 *
 * Search matches name OR email (server-side, volunteerAdminController.js).
 * Clicking a row opens that volunteer's read-only engagement view
 * (/volunteers/:id/engagement — admin/VolunteerEngagement.jsx), the same
 * data the volunteer sees on their own My Engagement page.
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
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

// Matches the Volunteer model's `engagement` enum (models/Volunteer.js) —
// stored lowercase, shown with the same labels the mockup used.
const ENGAGEMENTS = [
  { value: 'student', label: 'Student' },
  { value: 'professional', label: 'Working Professional' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'homemaker', label: 'Homemaker' },
  { value: 'retired', label: 'Retired' },
  { value: 'other', label: 'Other' },
];

function engagementLabel(value) {
  if (!value) return '—';
  return ENGAGEMENTS.find((e) => e.value === value)?.label || value;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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

export default function Volunteers() {
  const navigate = useNavigate();

  // Role comes from the real login session — Login.jsx writes 'admin' or
  // 'manager' to localStorage as `st_role` after a successful staff sign-in.
  // (This used to read a `?role=head` URL param, which meant a real Manager
  // account always saw the Super Admin view here, since normal navigation
  // never set that query string.) Anything other than exactly 'admin' is
  // treated as a manager — fail-safe, so a missing/unrecognized role sees
  // the more restricted view rather than the less restricted one.
  const isAdmin = localStorage.getItem('st_role') === 'admin';
  const [role] = useState(isAdmin ? 'super' : 'head');
  const shell = ROLE_SHELL[role];

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Volunteer Groups links here as /volunteers?district=<name> so clicking
  // a district in that tree lands pre-filtered — read once on mount, same
  // as a normal filter change from here on (no live URL sync back).
  const initialDistrict = new URLSearchParams(window.location.search).get('district');

  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState(initialDistrict || 'all');
  const [engagementFilter, setEngagementFilter] = useState('all');
  const [districts, setDistricts] = useState([]);

  // District picker is a searchable dropdown rather than a plain <select> —
  // the district list can get long, so districtQuery filters the options
  // shown while it's open. districtOpen/districtQuery both reset on pick or
  // outside-click; districtDropdownRef is what the outside-click listener
  // below checks against.
  const [districtOpen, setDistrictOpen] = useState(false);
  const [districtQuery, setDistrictQuery] = useState('');
  const districtDropdownRef = useRef(null);

  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Real distinct districts from the DB, not a hardcoded guess list.
  useEffect(() => {
    apiRequest('/volunteers/districts')
      .then(setDistricts)
      .catch(() => {
        /* non-fatal — the district dropdown just stays empty if this fails */
      });
  }, []);

  // Close the district dropdown on an outside click.
  useEffect(() => {
    if (!districtOpen) return undefined;
    const handleClick = (e) => {
      if (districtDropdownRef.current && !districtDropdownRef.current.contains(e.target)) {
        setDistrictOpen(false);
        setDistrictQuery('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [districtOpen]);

  const filteredDistricts = districts.filter((d) =>
    d.toLowerCase().includes(districtQuery.trim().toLowerCase())
  );

  const pickDistrict = (d) => {
    setDistrictFilter(d);
    setPage(1);
    setDistrictOpen(false);
    setDistrictQuery('');
  };

  useEffect(() => {
    setLoading(true);
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(districtFilter !== 'all' ? { district: districtFilter } : {}),
      ...(engagementFilter !== 'all' ? { engagement: engagementFilter } : {}),
    });

    // Small debounce so fast typing in the search box doesn't fire a
    // request per keystroke.
    const timeoutId = setTimeout(() => {
      apiRequest(`/volunteers?${query.toString()}`)
        .then((data) => {
          setVolunteers(data.volunteers);
          setTotalPages(data.pages);
          setTotal(data.total);
          setError('');
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search, districtFilter, engagementFilter, page]);

  const clearFilters = () => {
    setSearch('');
    setDistrictFilter('all');
    setEngagementFilter('all');
    setPage(1);
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="dash-page page-volunteers">
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
              <span className="icon">📋</span>Applications <span className="badge">7</span>
            </a>
            <a className="nav-item" href="/task-board">
              <span className="icon">🗂️</span>Task Board <span className="badge">4</span>
            </a>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Volunteers</div>
            <a className="nav-item active" href="/volunteers">
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
          <div className="topbar-title">Volunteers</div>
          <div className="topbar-right">
            <span className="topbar-role-chip">{shell.roleChip}</span>
            <ProfileMenu avatarInitial={shell.avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
          </div>
        </div>

        <div className="content">
          <div className="page-head">
            <div>
              <h1>Volunteers</h1>
              <p>Full directory · visible to Super Admin and Department Heads</p>
            </div>
          </div>

          <div className="section-card">
            <div className="filter-bar">
              <div className="search-wrap">
                <span className="s-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              {/* Searchable district picker — a plain <select> gets unwieldy
                  once there are dozens of districts, so this is a button +
                  dropdown panel with its own search box instead. */}
              <div className="district-dropdown" ref={districtDropdownRef}>
                <button
                  type="button"
                  className="filter-select district-select-btn"
                  onClick={() => setDistrictOpen((o) => !o)}
                >
                  <span>{districtFilter === 'all' ? 'All Districts' : districtFilter}</span>
                  <span className="dd-caret">▾</span>
                </button>
                {districtOpen && (
                  <div className="district-dropdown-panel">
                    <input
                      type="text"
                      className="district-search-input"
                      placeholder="Search districts..."
                      value={districtQuery}
                      onChange={(e) => setDistrictQuery(e.target.value)}
                      autoFocus
                    />
                    <div className="district-options">
                      <div
                        className={`district-option ${districtFilter === 'all' ? 'selected' : ''}`}
                        onClick={() => pickDistrict('all')}
                      >
                        All Districts
                      </div>
                      {filteredDistricts.map((d) => (
                        <div
                          key={d}
                          className={`district-option ${districtFilter === d ? 'selected' : ''}`}
                          onClick={() => pickDistrict(d)}
                        >
                          {d}
                        </div>
                      ))}
                      {filteredDistricts.length === 0 && (
                        <div className="district-option-empty">No matching districts</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <select
                className="filter-select"
                value={engagementFilter}
                onChange={(e) => {
                  setEngagementFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All Engagement Statuses</option>
                {ENGAGEMENTS.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
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
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>District</th>
                      <th>Engagement</th>
                      <th>Certificates</th>
                      <th>Hours</th>
                      <th>Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {volunteers.map((v) => (
                      <tr
                        key={v.id}
                        className="row-clickable"
                        onClick={() => navigate(`/volunteers/${v.id}/engagement`)}
                      >
                        <td data-label="Name">
                          <strong>{v.name}</strong>
                        </td>
                        <td data-label="Email">{v.email || '—'}</td>
                        <td data-label="District">{v.district || '—'}</td>
                        <td data-label="Engagement">{engagementLabel(v.engagement)}</td>
                        <td data-label="Certificates">{v.certificates}</td>
                        <td data-label="Hours">{v.hours} hrs</td>
                        <td data-label="Registered">{formatDate(v.registered)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {volunteers.length === 0 && (
                  <div className="zero-state show">
                    <div className="zs-icon">🔍</div>
                    <h3>No volunteers match your filters</h3>
                    <p>Try a different search term or clear the filters.</p>
                    <div className="zs-btns">
                      <button className="btn-ghost" onClick={clearFilters}>
                        Clear All Filters
                      </button>
                    </div>
                  </div>
                )}

                {volunteers.length > 0 && (
                  <div className="pagination">
                    <div className="p-info">
                      Showing {rangeStart}–{rangeEnd} of {total}
                    </div>
                    <div className="p-controls">
                      <button
                        className="p-btn"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
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
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
