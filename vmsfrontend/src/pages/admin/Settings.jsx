import { useEffect, useRef, useState } from 'react';
import './Settings.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Converted from admin-13-settings.html, wired to the real backend directly
 * in this file (no separate api service module, per request).
 *
 * BASE_URL / apiRequest at the top are local to this component. If you'd
 * rather share them across Settings.jsx and Departments.jsx, the natural
 * next step is pulling just these ~15 lines into one small shared file —
 * but for now both pages carry their own copy, exactly as asked.
 *
 * AUTH NOTE: staff login (Login.jsx) stores the JWT in localStorage under
 * `st_token` — the backend never sets an auth cookie, and
 * middleware/authMiddleware.js's `protect` only accepts an
 * `Authorization: Bearer <token>` header. apiRequest below sends that
 * header (reading the same `st_token` key Login.jsx writes) instead of
 * relying on `credentials: 'include'`, which was never backed by a real
 * cookie and caused every admin request here to fail with 401.
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

const DEPARTMENTS = [
  'IT',
  'Programs',
  'Operations',
  'Impact Reporting',
  'Design & Innovation',
  'Patron Care',
];

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

export default function Settings() {
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

  // Certificate template gallery state — replaces the old single-upload
  // certTemplate field with a list of CertificateTemplate documents
  // (backend controllers/certificateTemplateController.js) plus which one
  // is currently active. Switching the active template only affects
  // certificates issued from now on — an already-issued certificate stays
  // pinned to whatever template it was issued with (Application.certificateTemplateId).
  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState('');

  // "Add New Template" inline form state — a new upload always targets
  // layoutB (the shared coordinate set the current template family uses;
  // see backend utils/certificatePdf.js's LAYOUTS), so the only design
  // choice exposed here is which color palette reads legibly against the
  // uploaded artwork's background tone.
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateImage, setNewTemplateImage] = useState(null);
  const [newTemplatePalette, setNewTemplatePalette] = useState('light');
  const [addTemplateError, setAddTemplateError] = useState('');
  const [addingTemplate, setAddingTemplate] = useState(false);
  const addTemplateFileInputRef = useRef(null);

  // Admin Access (Department Head accounts) state
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState('');

  // Create account modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newAcct, setNewAcct] = useState({ name: '', email: '', department: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const loadAccounts = () => {
    setAccountsLoading(true);
    apiRequest('/managers')
      .then((data) => {
        setAccounts(data);
        setAccountsError('');
      })
      .catch((err) => setAccountsError(err.message))
      .finally(() => setAccountsLoading(false));
  };

  const loadTemplates = () => {
    setTemplatesLoading(true);
    apiRequest('/settings/certificate-templates')
      .then((data) => {
        setTemplates(data.templates || []);
        setActiveTemplateId(data.activeTemplateId || null);
        setTemplatesError('');
      })
      .catch((err) => setTemplatesError(err.message))
      .finally(() => setTemplatesLoading(false));
  };

  const activateTemplate = async (id) => {
    try {
      await apiRequest(`/settings/certificate-templates/${id}/activate`, { method: 'PUT' });
      loadTemplates();
    } catch (err) {
      setTemplatesError(err.message);
    }
  };

  const deleteTemplate = async (id) => {
    if (!window.confirm('Delete this certificate template? This cannot be undone.')) return;
    try {
      await apiRequest(`/settings/certificate-templates/${id}`, { method: 'DELETE' });
      loadTemplates();
    } catch (err) {
      setTemplatesError(err.message);
    }
  };

  // Reads the picked file into a base64 data URL, same as Profile.jsx's
  // handlePhotoChange. Validated client-side (type + size) for a fast
  // error message; the backend re-validates the data URL shape too.
  const handleAddTemplateFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setAddTemplateError('Certificate template must be a JPG or PNG image.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setAddTemplateError('Certificate template must be 3MB or smaller.');
      return;
    }
    setAddTemplateError('');
    const reader = new FileReader();
    reader.onload = (ev) => setNewTemplateImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  const submitNewTemplate = async () => {
    if (!newTemplateName.trim()) {
      setAddTemplateError('Please enter a name for this template.');
      return;
    }
    if (!newTemplateImage) {
      setAddTemplateError('Please choose an image for this template.');
      return;
    }
    setAddingTemplate(true);
    setAddTemplateError('');
    try {
      await apiRequest('/settings/certificate-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: newTemplateName.trim(),
          image: newTemplateImage,
          layout: 'layoutB',
          palette: newTemplatePalette,
        }),
      });
      setShowAddTemplate(false);
      setNewTemplateName('');
      setNewTemplateImage(null);
      setNewTemplatePalette('light');
      loadTemplates();
    } catch (err) {
      setAddTemplateError(err.message);
    } finally {
      setAddingTemplate(false);
    }
  };

  useEffect(() => {
    if (isRestricted) return;
    loadAccounts();
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRestricted]);

  const toggleAccountStatus = async (id) => {
    try {
      await apiRequest(`/managers/${id}/toggle-status`, { method: 'PATCH' });
      loadAccounts();
    } catch (err) {
      alert(err.message);
    }
  };

  const openCreateAccount = () => {
    setNewAcct({ name: '', email: '', department: '' });
    setCreateError('');
    setCreateModalOpen(true);
  };

  const createAccount = async () => {
    if (!newAcct.name.trim() || !newAcct.email.trim() || !newAcct.department) {
      setCreateError('Please enter a name, email, and select a department.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const res = await apiRequest('/managers', {
        method: 'POST',
        body: JSON.stringify({
          name: newAcct.name.trim(),
          email: newAcct.email.trim(),
          department: newAcct.department,
        }),
      });
      setCreateModalOpen(false);
      loadAccounts();
      alert(res.message || 'Account created.');
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="dash-page page-settings">
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
              <a className="nav-item" href="/departments">
                <span className="icon">🏢</span>Departments
              </a>
              <a className="nav-item" href="/activity-log">
                <span className="icon">🕓</span>Activity Log
              </a>
              <a className="nav-item active" href="/settings">
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
          <div className="topbar-title">Settings</div>
          <div className="topbar-right">
            <span className="topbar-role-chip">{shell.roleChip}</span>
            <ProfileMenu avatarInitial={shell.avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
          </div>
        </div>

        <div className="content">
          <div className="page-head">
            <div>
              <h1>Settings</h1>
              <p>Certificate templates · Super Admin only</p>
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
              {/* Certificate Templates */}
              <div className="section-card">
                <h3>Certificate Templates</h3>

                  <div className="field-group">
                    <div className="field-hint">
                      Choose which design new certificates are issued with. Switching the active
                      template never changes certificates that were already issued — those keep
                      the design they were issued with.
                    </div>
                    {templatesError && <p className="form-error">{templatesError}</p>}
                    {templatesLoading ? (
                      <p className="field-hint">Loading templates…</p>
                    ) : (
                      <div className="template-gallery">
                        {templates.map((t) => (
                          <div key={t._id} className={`template-card ${t._id === activeTemplateId ? 'is-active' : ''}`}>
                            <div
                              className="template-thumb"
                              style={t.image ? { backgroundImage: `url(${t.image})` } : undefined}
                            >
                              {!t.image && '📄'}
                            </div>
                            <div className="template-card-body">
                              <div className="template-name">
                                {t.name}
                                {t._id === activeTemplateId && <span className="template-active-badge">Active</span>}
                              </div>
                              <div className="template-card-actions">
                                {t._id !== activeTemplateId && (
                                  <button type="button" className="btn-ghost" onClick={() => activateTemplate(t._id)}>
                                    Set Active
                                  </button>
                                )}
                                {!t.isDefault && t._id !== activeTemplateId && (
                                  <button type="button" className="btn-ghost warn" onClick={() => deleteTemplate(t._id)}>
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        <div
                          className="template-card template-card--add"
                          role="button"
                          tabIndex={0}
                          onClick={() => setShowAddTemplate((v) => !v)}
                        >
                          <div className="template-add-icon">+</div>
                          <div>Add New Template</div>
                        </div>
                      </div>
                    )}

                    {showAddTemplate && (
                      <div className="template-add-form">
                        <div className="field-group">
                          <label className="field-label">Template Name</label>
                          <input
                            type="text"
                            className="field-input"
                            value={newTemplateName}
                            onChange={(e) => setNewTemplateName(e.target.value)}
                            placeholder="e.g. Spring 2027"
                          />
                        </div>
                        <div className="field-group">
                          <label className="field-label">Text Color</label>
                          <select
                            className="field-input"
                            value={newTemplatePalette}
                            onChange={(e) => setNewTemplatePalette(e.target.value)}
                          >
                            <option value="light">Dark text (for a light-colored background)</option>
                            <option value="dark">Light text (for a dark-colored background)</option>
                          </select>
                        </div>
                        <div className="field-group">
                          <label className="field-label">Image</label>
                          <div className="logo-upload">
                            <div className="logo-preview">
                              {newTemplateImage ? (
                                <img src={newTemplateImage} alt="New template preview" className="logo-preview-img" />
                              ) : (
                                '📄'
                              )}
                            </div>
                            <div className="logo-upload-actions">
                              <input
                                type="file"
                                accept="image/png,image/jpeg"
                                ref={addTemplateFileInputRef}
                                onChange={handleAddTemplateFileChange}
                                style={{ display: 'none' }}
                              />
                              <button
                                type="button"
                                className="btn-ghost"
                                onClick={() => addTemplateFileInputRef.current?.click()}
                              >
                                {newTemplateImage ? 'Replace Image' : 'Choose Image'}
                              </button>
                            </div>
                          </div>
                          <div className="field-hint">JPG or PNG, landscape orientation recommended, max 3MB.</div>
                        </div>
                        {addTemplateError && <p className="form-error">{addTemplateError}</p>}
                        <div className="form-actions">
                          <button type="button" className="btn-ghost" onClick={() => setShowAddTemplate(false)}>
                            Cancel
                          </button>
                          <button type="button" className="btn-primary" onClick={submitNewTemplate} disabled={addingTemplate}>
                            {addingTemplate ? 'Adding...' : 'Add Template'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
              </div>

              {/* Admin Access */}
              <div className="section-card">
                <h3>Admin Access</h3>
                <div className="field-hint admin-access-hint">
                  Create and manage Department Head accounts. Super Admin only.
                </div>
                <div className="admin-access-head">
                  <div></div>
                  <button className="btn-primary" onClick={openCreateAccount}>
                    + Create Department Head Account
                  </button>
                </div>

                {accountsError && <p className="form-error">{accountsError}</p>}

                <div className="table-wrap">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Department</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountsLoading ? (
                        <tr>
                          <td colSpan={5} className="table-empty">
                            Loading accounts...
                          </td>
                        </tr>
                      ) : accounts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="table-empty">
                            No Department Head accounts yet.
                          </td>
                        </tr>
                      ) : (
                        accounts.map((a) => (
                          <tr key={a._id}>
                            <td data-label="Name">
                              <div className="name-cell">
                                <div className="name-avatar">
                                  {a.name?.trim()?.[0]?.toUpperCase() || '?'}
                                </div>
                                <strong>{a.name}</strong>
                              </div>
                            </td>
                            <td data-label="Email">{a.email}</td>
                            <td data-label="Department">
                              <span className="dept-chip">{a.department}</span>
                            </td>
                            <td data-label="Status">
                              {a.isActive ? (
                                <span className="status-chip status-active">Active</span>
                              ) : (
                                <span className="status-chip status-deactivated">Disabled</span>
                              )}
                            </td>
                            <td data-label="Actions">
                              <div className="row-actions">
                                <button
                                  className={`btn-ghost ${a.isActive ? 'warn' : ''}`}
                                  onClick={() => toggleAccountStatus(a._id)}
                                >
                                  {a.isActive ? 'Disable' : 'Enable'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                </div>
              </div>
            </div>
          )}

          {/* CREATE DEPARTMENT HEAD ACCOUNT MODAL */}
          <div className={`modal-overlay ${createModalOpen ? 'show' : ''}`}>
            <div className="modal-box">
              <h2>Create Department Head Account</h2>
              <div className="m-sub">
                The account is created immediately; they sign in with this email via Google.
              </div>

              {createError && <p className="form-error">{createError}</p>}

              <div className="field-group">
                <label className="field-label">
                  Full Name <span className="field-required">*</span>
                </label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="e.g. Neha Kulkarni"
                  value={newAcct.name}
                  onChange={(e) => setNewAcct({ ...newAcct, name: e.target.value })}
                />
              </div>

              <div className="field-group">
                <label className="field-label">
                  Email <span className="field-required">*</span>
                </label>
                <input
                  type="email"
                  className="field-input"
                  placeholder="name@sankalptaru.org"
                  value={newAcct.email}
                  onChange={(e) => setNewAcct({ ...newAcct, email: e.target.value })}
                />
              </div>

              <div className="field-group">
                <label className="field-label">
                  Department <span className="field-required">*</span>
                </label>
                <select
                  className="field-input"
                  value={newAcct.department}
                  onChange={(e) => setNewAcct({ ...newAcct, department: e.target.value })}
                >
                  <option value="" disabled>
                    Select a department
                  </option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <div className="field-hint">One department per account.</div>
              </div>

              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setCreateModalOpen(false)} disabled={creating}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={createAccount} disabled={creating}>
                  {creating ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
