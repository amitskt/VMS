import { Fragment, useEffect, useState } from 'react';
import './Applications.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Application review (Super Admin + Department Heads) — makes the Track B
 * pipeline (Under Review -> Shortlisted -> Task Assigned -> Completed)
 * usable end-to-end, not just visible on the volunteer side. The old
 * separate 'selected' step was removed — a task can now be assigned
 * directly to any Shortlisted application from the Task Board. Same
 * department-scoping and auth pattern as Volunteers.jsx / the admin
 * Opportunities.jsx: manager sees only their own department, resolved
 * server-side (see adminApplicationController.js) never trusted from here —
 * an admin sees every department's applications, a manager (e.g. the IT
 * department head) only ever sees applications against opportunities their
 * own department owns.
 *
 * Converted from admin-05-applications.html (the mockup that every other
 * admin page's sidebar already linked to — dead, since it was a static file
 * with no real route behind it until now). Kept from the mockup: the
 * Department + Match columns, and a row-expand "View" panel showing the
 * volunteer's interest note/portfolio/availability plus quick actions.
 * Adapted rather than copied literally:
 * - The mockup's fixed 4 quick-action buttons (Move to Under Review /
 *   Shortlist / Select / Reject) don't match this app's real pipeline —
 *   applications are created straight into `under_review` (there's no
 *   separate "Applied" pre-review state to move out of). The quick action
 *   here is instead "advance to the next real status" + "Reject" (see
 *   STATUS_FLOW/STATUS_FLOW_LABEL below), plus a "Manage" button that opens
 *   the full modal (any status, optional note) for anything else.
 * - STATUS_FLOW stops at 'shortlisted' on purpose — Task Assigned and
 *   Completed are no longer reachable from here at all (the backend now
 *   rejects both as direct status targets for Track B; see
 *   adminApplicationController.js). Once a Task Board exists, those two
 *   statuses only mean something when they're the side effect of a real
 *   Task record (its assignment, and its hours-logged approval) — a bare
 *   status flip here used to let an application say "Task Assigned" with no
 *   task actually created, which is exactly the bug that prompted this.
 *   'shortlisted' now shows a "Assign Task on Task Board →" link instead of
 *   a further quick-advance button.
 * - "Match breakdown" shows this application's real Gemini reasons
 *   (matchReasons) instead of the mockup's fabricated skills/mode/location
 *   sub-scores, which nothing in this codebase actually computes.
 * - "View Volunteer Profile" is dropped — no admin volunteer-detail route
 *   exists yet (Volunteers.jsx is list-only).
 * - Match score / breakdown only applies to Track B (Track A has no Gemini
 *   matching and self-progresses claimed -> submitted -> completed).
 */

const BASE_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/admin`;
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

const STATUS_LABELS = {
  under_review: 'Under Review',
  shortlisted: 'Shortlisted',
  task_assigned: 'Task Assigned',
  completed: 'Completed',
  not_selected: 'Not Selected',
  withdrawn: 'Withdrawn',
  claimed: 'Claimed',
  submitted: 'Submitted',
};

// Track B's forward path — used to derive a single "advance" quick action
// from whatever status an application currently holds, instead of the
// mockup's fixed button set (which assumed a shorter pipeline). Stops at
// 'shortlisted' — see the file header comment for why Task Assigned and
// Completed (and the assignment step itself) are deliberately not reachable
// through this quick action.
const STATUS_FLOW = {
  under_review: 'shortlisted',
};
const STATUS_FLOW_LABEL = {
  shortlisted: 'Shortlist',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const START_LABELS = {
  immediate: 'Immediately',
  '2weeks': 'Within 2 weeks',
  '1month': 'Within 1 month',
  flexible: 'Flexible',
};

const ROLE_SHELL = {
  super: { userName: 'Apurva', userRole: 'Super Admin', avatarInitial: 'A', roleChip: 'Super Admin · All Departments', showAdminSection: true },
  head: { userName: 'Amit', userRole: 'Department Head · Programs', avatarInitial: 'V', roleChip: 'Department Head · Programs', showAdminSection: false },
};

export default function Applications() {
  const isAdmin = localStorage.getItem('st_role') === 'admin';
  const [role] = useState(isAdmin ? 'super' : 'head');
  const shell = ROLE_SHELL[role];

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [meta, setMeta] = useState({ trackAStatuses: [], trackBStatuses: [], departments: [], myDepartment: null });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [trackFilter, setTrackFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [expandedId, setExpandedId] = useState(null);
  const [quickActionError, setQuickActionError] = useState('');
  const [quickActionBusyId, setQuickActionBusyId] = useState(null);

  const [manageTarget, setManageTarget] = useState(null); // application object
  const [newStatus, setNewStatus] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    apiRequest('/applications/meta').then(setMeta).catch(() => {
      /* non-fatal — filter dropdowns just stay empty if this fails */
    });
  }, []);

  const load = () => {
    setLoading(true);
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      ...(trackFilter !== 'all' ? { track: trackFilter } : {}),
      ...(deptFilter !== 'all' ? { department: deptFilter } : {}),
    });
    const timeoutId = setTimeout(() => {
      apiRequest(`/applications?${query.toString()}`)
        .then((data) => {
          setApplications(data.applications);
          setTotalPages(data.pages);
          setTotal(data.total);
          setError('');
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeoutId);
  };

  useEffect(load, [search, statusFilter, trackFilter, deptFilter, page]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTrackFilter('all');
    setDeptFilter('all');
    setPage(1);
  };

  const toggleExpanded = (id) => {
    setQuickActionError('');
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const quickSetStatus = async (app, status) => {
    setQuickActionBusyId(app.id);
    setQuickActionError('');
    try {
      await apiRequest(`/applications/${app.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err) {
      setQuickActionError(err.message);
    } finally {
      setQuickActionBusyId(null);
    }
  };

  const openManage = (app) => {
    setManageTarget(app);
    setNewStatus(app.status);
    setNote('');
    setSaveError('');
  };

  const saveStatus = async () => {
    if (!manageTarget) return;
    setSaving(true);
    setSaveError('');
    try {
      await apiRequest(`/applications/${manageTarget.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, note }),
      });
      setManageTarget(null);
      load();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  // task_assigned/completed excluded for Track B — the backend rejects both
  // as direct targets now (see file header comment), so they're not offered
  // as options here either.
  const availableStatuses = manageTarget
    ? manageTarget.track === 'a'
      ? meta.trackAStatuses
      : meta.trackBStatuses.filter((s) => s !== 'task_assigned' && s !== 'completed')
    : [];
  const isTerminal = manageTarget && ['completed', 'withdrawn', 'not_selected'].includes(manageTarget.status);

  return (
    <div className="dash-page page-applications">
      {manageTarget && (
        <div className="modal-overlay show">
          <div className="modal-card">
            <h3>Update Application</h3>
            <p>
              <strong>{manageTarget.volunteer.name}</strong> — {manageTarget.opportunity.title}
            </p>
            {isTerminal ? (
              <p style={{ color: 'var(--gray-400)' }}>This application has already reached a final status ({STATUS_LABELS[manageTarget.status]}) and can no longer be changed.</p>
            ) : (
              <>
                <div className="field-group">
                  <label className="field-label">New Status</label>
                  <select className="field-input" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                    {availableStatuses.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                    ))}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Note to volunteer <span className="field-hint" style={{ marginTop: 0 }}>(optional — shown as their "Next Step")</span></label>
                  <textarea className="field-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. You'll hear from the coordinator by Friday." />
                </div>
              </>
            )}
            {saveError && <p className="form-error">{saveError}</p>}
            <div className="modal-btns">
              <button className="btn-cancel" onClick={() => setManageTarget(null)} disabled={saving}>Close</button>
              {!isTerminal && (
                <button className="btn-confirm" onClick={saveStatus} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              )}
            </div>
          </div>
        </div>
      )}

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
            <a className="nav-item" href="/admin-dashboard"><span className="icon">🏠</span>Dashboard</a>
          </div>
          <div className="nav-section">
            <div className="nav-section-title">Opportunities</div>
            <a className="nav-item" href="/opportunities"><span className="icon">🌱</span>Opportunities</a>
            <a className="nav-item active" href="/applications"><span className="icon">📋</span>Applications</a>
          </div>
          <div className="nav-section">
            <div className="nav-section-title">Volunteers</div>
            <a className="nav-item" href="/volunteers"><span className="icon">👥</span>Volunteers</a>
          </div>
          {shell.showAdminSection && (
            <div className="nav-section">
              <div className="nav-section-title">Administration</div>
              <a className="nav-item" href="/departments"><span className="icon">🏢</span>Departments</a>
              <a className="nav-item" href="/settings"><span className="icon">⚙️</span>Settings</a>
            </div>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="avatar">{shell.avatarInitial}</div>
            <div className="user-info"><div className="name">{shell.userName}</div><div className="role">{shell.userRole}</div></div>
          </div>
        </div>
      </aside>

      <div className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
          <div className="topbar-title">Applications</div>
          <div className="topbar-right">
            <span className="topbar-role-chip">{shell.roleChip}</span>
            <ProfileMenu avatarInitial={shell.avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
          </div>
        </div>

        <div className="content">
          <div className="page-head">
            <div>
              <h1>Applications</h1>
              <p>Track B review pipeline{meta.myDepartment ? ` · ${meta.myDepartment}` : ' · all departments'}</p>
            </div>
          </div>

          <div className="section-card">
            <div className="filter-bar">
              <div className="search-wrap">
                <span className="s-icon">🔍</span>
                <input type="text" placeholder="Search volunteer or opportunity…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <select className="filter-select" value={trackFilter} onChange={(e) => { setTrackFilter(e.target.value); setPage(1); }}>
                <option value="all">All Tracks</option>
                <option value="a">Track A</option>
                <option value="b">Track B</option>
              </select>
              <select className="filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                <option value="all">All Statuses</option>
                {[...meta.trackAStatuses, ...meta.trackBStatuses]
                  .filter((s, i, arr) => arr.indexOf(s) === i)
                  .map((s) => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
              </select>
              {!meta.myDepartment && (
                <select className="filter-select" value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}>
                  <option value="all">All Departments</option>
                  {meta.departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
            </div>
            {meta.myDepartment && (
              <div className="filter-note">Showing applications for opportunities owned by <strong>{meta.myDepartment}</strong></div>
            )}

            {error && <p className="form-error">{error}</p>}
            {quickActionError && <p className="form-error">{quickActionError}</p>}

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
                      <th>Volunteer</th>
                      <th>Opportunity</th>
                      <th>Department</th>
                      <th>Track</th>
                      <th>Match</th>
                      <th>Status</th>
                      <th>Applied</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((a) => {
                      const nextStatus = STATUS_FLOW[a.status];
                      const canQuickAct = a.track === 'b' && !!nextStatus;
                      const busy = quickActionBusyId === a.id;
                      return (
                        <Fragment key={a.id}>
                          <tr>
                            <td data-label="Volunteer"><strong>{a.volunteer.name}</strong></td>
                            <td data-label="Opportunity">{a.opportunity.title}</td>
                            <td data-label="Department"><span className="dept-chip">{a.department}</span></td>
                            <td data-label="Track"><span className={`track-chip ${a.track === 'a' ? 'track-a' : 'track-b'}`}>{a.track === 'a' ? 'Track A' : 'Track B'}</span></td>
                            <td data-label="Match">{a.matchScore != null ? `${a.matchScore}%` : '—'}</td>
                            <td data-label="Status">
                              <span className={`status-pill ${a.chip.variant}`}>{a.chip.label}</span>
                            </td>
                            <td data-label="Applied">{formatDate(a.appliedAt)}</td>
                            <td data-label="">
                              <button className="btn-ghost" onClick={() => toggleExpanded(a.id)}>{expandedId === a.id ? 'Hide' : 'View'}</button>
                            </td>
                          </tr>
                          {expandedId === a.id && (
                            <tr>
                              <td colSpan={8} style={{ padding: '0 14px 14px' }}>
                                <div className="detail-panel show">
                                  <div className="detail-row">
                                    {a.track === 'b' ? (
                                      <>
                                        <div className="detail-col">
                                          <h5>Why interested</h5>
                                          <p>{a.interestDetails?.motivation || '—'}</p>
                                        </div>
                                        <div className="detail-col">
                                          <h5>Portfolio</h5>
                                          <p>{a.interestDetails?.portfolioUrl || '—'}</p>
                                          <h5 style={{ marginTop: 10 }}>Can start</h5>
                                          <p>{START_LABELS[a.interestDetails?.startAvailability] || '—'}</p>
                                        </div>
                                        <div className="detail-col">
                                          <h5>Match breakdown</h5>
                                          {a.matchReasons && a.matchReasons.length > 0 ? (
                                            <div className="match-breakdown">
                                              {a.matchReasons.map((r, i) => <span className="match-pill" key={i}>{r}</span>)}
                                            </div>
                                          ) : (
                                            <p>No breakdown available.</p>
                                          )}
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <div className="detail-col">
                                          <h5>Claim details</h5>
                                          <p>
                                            City: {a.claimDetails?.city || '—'}<br />
                                            Planned date: {formatDate(a.claimDetails?.plannedDate)}<br />
                                            Notes: {a.claimDetails?.species || '—'}
                                          </p>
                                        </div>
                                        <div className="detail-col">
                                          <h5>Submission</h5>
                                          <p>{a.submission ? a.submission.text : 'Not submitted yet.'}</p>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  <div className="detail-actions">
                                    {canQuickAct && (
                                      <>
                                        <button className="btn-primary" disabled={busy} onClick={() => quickSetStatus(a, nextStatus)}>
                                          {busy ? 'Saving…' : STATUS_FLOW_LABEL[nextStatus]}
                                        </button>
                                        <button className="btn-ghost danger" disabled={busy} onClick={() => quickSetStatus(a, 'not_selected')}>Reject</button>
                                      </>
                                    )}
                                    {a.track === 'b' && a.status === 'shortlisted' && (
                                      <a className="btn-primary" href="/task-board" style={{ textDecoration: 'none' }}>Assign Task on Task Board →</a>
                                    )}
                                    {a.track === 'b' && a.status === 'task_assigned' && (
                                      <a className="btn-ghost" href="/task-board" style={{ textDecoration: 'none' }}>Review Task on Task Board →</a>
                                    )}
                                    <button className="btn-ghost" onClick={() => openManage(a)}>Manage…</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>

                {applications.length === 0 && (
                  <div className="zero-state show">
                    <div className="zs-icon">📋</div>
                    <h3>No applications match your filters</h3>
                    <p>Try a different search term or clear the filters.</p>
                    <div className="zs-btns"><button className="btn-ghost" onClick={clearFilters}>Clear All Filters</button></div>
                  </div>
                )}

                {applications.length > 0 && (
                  <div className="pagination">
                    <div className="p-info">Showing {rangeStart}–{rangeEnd} of {total}</div>
                    <div className="p-controls">
                      <button className="p-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
                      <button className="p-btn active">{page}</button>
                      <button className="p-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
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
