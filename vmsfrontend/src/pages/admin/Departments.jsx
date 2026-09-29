import { useEffect, useState } from 'react';
import './Departments.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Converted from admin-11-departments.html, wired to the real backend
 * directly in this file (no separate api service module, per request).
 * See the top of Settings.jsx for the note on token-based auth — the
 * backend only accepts an `Authorization: Bearer <token>` header (the
 * token Login.jsx stores under `st_token`), so that's what apiRequest
 * sends here too.
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

export default function Departments() {
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
  const isRestricted = role === 'head';

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [departments, setDepartments] = useState([]);
  const [deptsLoading, setDeptsLoading] = useState(true);
  const [deptsError, setDeptsError] = useState('');

  const [managers, setManagers] = useState([]);

  const [activeDept, setActiveDept] = useState(null);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');

  const loadDepartments = () => {
    setDeptsLoading(true);
    apiRequest('/departments')
      .then((data) => {
        setDepartments(data);
        setDeptsError('');
      })
      .catch((err) => setDeptsError(err.message))
      .finally(() => setDeptsLoading(false));
  };

  const loadManagers = () => {
    apiRequest('/managers')
      .then(setManagers)
      .catch(() => {
        /* non-fatal — the assign dropdown will just be empty if this fails */
      });
  };

  useEffect(() => {
    if (isRestricted) return;
    loadDepartments();
    loadManagers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRestricted]);

  const openAssignModal = (deptName) => {
    setActiveDept(deptName);
    setSelectedManagerId('');
    setAssignError('');
    setModalOpen(true);
  };

  const closeAssignModal = () => {
    setModalOpen(false);
    setActiveDept(null);
  };

  const confirmAssign = async () => {
    if (!selectedManagerId) {
      setAssignError('Select a manager to assign.');
      return;
    }
    setAssigning(true);
    setAssignError('');
    try {
      await apiRequest(`/departments/${encodeURIComponent(activeDept)}/assign-head`, {
        method: 'PATCH',
        body: JSON.stringify({ managerId: selectedManagerId }),
      });
      closeAssignModal();
      loadDepartments();
      loadManagers();
    } catch (err) {
      setAssignError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="dash-page page-departments">
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
              <a className="nav-item active" href="/departments">
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
          <div className="topbar-title">Departments</div>
          <div className="topbar-right">
            <span className="topbar-role-chip">{shell.roleChip}</span>
            <ProfileMenu avatarInitial={shell.avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
          </div>
        </div>

        <div className="content">
          <div className="page-head">
            <div>
              <h1>Departments</h1>
              <p>Six fixed departments · Super Admin only</p>
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
            <div>
              <div className="field-hint dept-hint">
                Departments are fixed and cannot be created, renamed, or removed. Super Admin
                can assign Department Head(s) to each.
              </div>

              {deptsError && <p className="form-error">{deptsError}</p>}

              {deptsLoading ? (
                <p className="dept-loading">Loading departments...</p>
              ) : (
                <div className="dept-grid">
                  {departments.map((d) => (
                    <div key={d.name} className="dept-card">
                      <h4>{d.name}</h4>
                      <div className="d-head">
                        Department Head:{' '}
                        <strong>
                          {d.heads.length > 0 ? d.heads.map((h) => h.name).join(', ') : 'Unassigned'}
                        </strong>
                      </div>
                      <div className="d-stats">
                        <div className="d-stat">
                          <div className="n">{d.opportunitiesCount}</div>
                          <div className="l">Opportunities</div>
                        </div>
                        <div className="d-stat">
                          <div className="n">{d.openApplicationsCount}</div>
                          <div className="l">Open Applications</div>
                        </div>
                      </div>
                      <button className="btn-ghost" onClick={() => openAssignModal(d.name)}>
                        Assign Department Head
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ASSIGN MODAL */}
          <div className={`modal-overlay ${modalOpen ? 'show' : ''}`}>
            <div className="modal-box">
              <h2 className="modal-title">
                Assign Department Head{activeDept ? ` — ${activeDept}` : ''}
              </h2>
              <div className="modal-subtext">
                Selecting a manager here sets their department to this one (they can only belong
                to one).
              </div>

              {assignError && <p className="form-error">{assignError}</p>}

              <div className="field-group">
                <label className="field-label">Manager</label>
                <select
                  className="field-input"
                  value={selectedManagerId}
                  onChange={(e) => setSelectedManagerId(e.target.value)}
                >
                  <option value="" disabled>
                    Select a manager
                  </option>
                  {managers.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name} {m.department ? `(currently ${m.department})` : ''}
                    </option>
                  ))}
                </select>
                {managers.length === 0 && (
                  <div className="field-hint">
                    No managers found — create one from the Settings page first.
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button className="btn-ghost" onClick={closeAssignModal} disabled={assigning}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={confirmAssign} disabled={assigning}>
                  {assigning ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
