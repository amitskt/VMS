import { useEffect, useMemo, useState } from 'react';
import './VolunteerGroups.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Converted from admin-08-volunteer-groups.html, wired to the real backend.
 * See Volunteers.jsx / Departments.jsx for the note on token-based auth —
 * same pattern here: Authorization: Bearer <st_token>.
 *
 * The mockup's tree grouped by Country -> State -> City; this groups by
 * Country -> State -> District instead, using the real `state`/`district`
 * fields on every Volunteer (see volunteerAdminController.js's
 * `listVolunteerGroups`) — the same `district` the Volunteers directory
 * filter and the public landing page's "Districts Covered" stat already
 * use. There's no `country` field on the Volunteer model (every address
 * this app collects is already India-specific), so "India" is a fixed root
 * label, not a grouped value. A volunteer who hasn't filled in state/
 * district yet lands under "Unspecified State" / "No district on file"
 * rather than being silently dropped from the counts.
 *
 * Clicking a district routes to the Volunteers directory pre-filtered to
 * that district (via ?district=..., read by Volunteers.jsx on mount) —
 * unlike a city, district is a real filter Volunteers.jsx already supports,
 * so this is a working filter rather than a dead link.
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

function matchesQuery(name, query) {
  return !query || name.toLowerCase().includes(query);
}

export default function VolunteerGroups() {
  // Role comes from the real login session — see Volunteers.jsx for the
  // full explanation of this pattern.
  const isAdmin = localStorage.getItem('st_role') === 'admin';
  const [role] = useState(isAdmin ? 'super' : 'head');
  const shell = ROLE_SHELL[role];

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [countryOpen, setCountryOpen] = useState(true);
  const [openStates, setOpenStates] = useState(() => new Set());

  useEffect(() => {
    setLoading(true);
    apiRequest('/volunteers/groups')
      .then((res) => {
        setData(res);
        setError('');
        // Start fully expanded, same as clicking "Expand All" — with only
        // ever one country and a handful of states, there's no real
        // information-density reason to make admins click through a
        // collapsed tree on first load.
        setCountryOpen(true);
        setOpenStates(new Set(res.country.states.map((s) => s.name)));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const query = search.trim().toLowerCase();

  const expandAll = () => {
    if (!data) return;
    setCountryOpen(true);
    setOpenStates(new Set(data.country.states.map((s) => s.name)));
  };
  const collapseAll = () => {
    setCountryOpen(false);
    setOpenStates(new Set());
  };
  const toggleState = (name) => {
    setOpenStates((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const goToVolunteers = (districtName) => {
    window.location.href = `/volunteers?district=${encodeURIComponent(districtName)}`;
  };

  const stats = useMemo(() => {
    if (!data) return null;
    return [
      { label: 'Total Volunteers', value: data.totalVolunteers },
      { label: 'States Represented', value: data.statesRepresented },
      { label: 'Districts Represented', value: data.districtsRepresented },
    ];
  }, [data]);

  return (
    <div className="dash-page page-volunteer-groups">
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
            <a className="nav-item active" href="/volunteer-groups">
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
          <div className="topbar-title">Volunteer Groups</div>
          <div className="topbar-right">
            <span className="topbar-role-chip">{shell.roleChip}</span>
            <ProfileMenu avatarInitial={shell.avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
          </div>
        </div>

        <div className="content">
          <div className="page-head">
            <div>
              <h1>Volunteer Groups</h1>
              <p>Automatically grouped by Country → State → District · read-only</p>
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <>
              <div className="groups-stat-grid">
                <div className="skeleton skel-stat" />
                <div className="skeleton skel-stat" />
                <div className="skeleton skel-stat" />
              </div>
              <div style={{ height: 20 }} />
              <div className="section-card">
                <div className="loading-state">
                  <div className="skeleton skel-row" />
                  <div className="skeleton skel-row" />
                  <div className="skeleton skel-row" />
                </div>
              </div>
            </>
          ) : !data || data.totalVolunteers === 0 ? (
            <div className="section-card">
              <div className="zero-state show">
                <div className="zs-icon">📍</div>
                <h3>No volunteers yet</h3>
                <p>Once volunteers register and complete their profile, they'll show up here grouped by state and district.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="groups-stat-grid">
                {stats.map((s) => (
                  <div key={s.label} className="section-card groups-stat-card">
                    <h3>{s.label}</h3>
                    <div className="groups-stat-num">{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ height: 20 }} />

              <div className="section-card">
                <div className="filter-bar">
                  <div className="search-wrap">
                    <span className="s-icon">🔍</span>
                    <input
                      type="text"
                      placeholder="Search district or state..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <button className="btn-ghost" onClick={expandAll}>
                    Expand All
                  </button>
                  <button className="btn-ghost" onClick={collapseAll}>
                    Collapse All
                  </button>
                </div>

                <div className="tree">
                  <div className="tree-country">
                    <div
                      className={`tree-row ${countryOpen ? 'open' : ''}`}
                      onClick={() => setCountryOpen((o) => !o)}
                    >
                      <span className="caret">▶</span>
                      <span
                        className="t-label"
                        style={{ opacity: matchesQuery(data.country.name, query) ? 1 : 0.3 }}
                      >
                        {data.country.name}
                      </span>
                      <span className="t-count">{data.country.count} volunteers</span>
                    </div>

                    <div className={`tree-children ${countryOpen ? 'open' : ''}`}>
                      {data.country.states.map((st) => (
                        <div key={st.name}>
                          <div
                            className={`tree-row ${openStates.has(st.name) ? 'open' : ''}`}
                            onClick={() => toggleState(st.name)}
                          >
                            <span className="caret">▶</span>
                            <span
                              className="t-label"
                              style={{ opacity: matchesQuery(st.name, query) ? 1 : 0.3 }}
                            >
                              {st.name}
                            </span>
                            <span className="t-count">{st.count}</span>
                          </div>
                          <div className={`tree-children ${openStates.has(st.name) ? 'open' : ''}`}>
                            {st.districts.map((district) => (
                              <div
                                key={district.name}
                                className="tree-row"
                                onClick={
                                  district.name === 'No district on file'
                                    ? undefined
                                    : () => goToVolunteers(district.name)
                                }
                                style={{
                                  opacity: matchesQuery(district.name, query) ? 1 : 0.3,
                                  cursor: district.name === 'No district on file' ? 'default' : 'pointer',
                                }}
                              >
                                <span className="caret"></span>
                                <span className="t-label tree-city">{district.name}</span>
                                <span className="t-count">{district.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
