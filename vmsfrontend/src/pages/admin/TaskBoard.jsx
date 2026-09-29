import { useEffect, useState } from 'react';
import './TaskBoard.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Task Board (Super Admin + Department Heads) — converted from
 * admin-09-task-board.html. Same department-scoping and auth pattern as
 * Applications.jsx: a manager only ever sees/manages tasks against
 * opportunities their own department owns, resolved server-side (see
 * adminTaskController.js), never trusted from here.
 *
 * Adapted from the mockup:
 * - Drag-and-drop is real (native HTML5 DnD, same idea as the mockup's
 *   vanilla JS, translated to React state) and calls the real status-update
 *   API — dropping onto "Completed" opens the same contribution-hours
 *   prompt the mockup used a plain `alert()` guard for, just as a proper
 *   modal instead of a browser alert.
 * - "Request Revision" writes the feedback as a Task comment (visible to
 *   the volunteer on My Tasks) rather than a separate untracked field.
 * - The volunteer dropdown in "Assign Task" is real — only Track B
 *   applications currently at 'shortlisted' with no task yet
 *   (GET /admin/tasks/assignable), scoped the same way as everything else
 *   here, instead of the mockup's single hardcoded option. (The old separate
 *   'selected' step was removed — 'shortlisted' is now the only gate.)
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

const COLUMNS = [
  { id: 'assigned', label: 'Assigned' },
  { id: 'inprogress', label: 'In Progress' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'revision', label: 'Revision Needed' },
  { id: 'completed', label: 'Completed' },
];

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const ROLE_SHELL = {
  super: { userName: 'Apurva', userRole: 'Super Admin', avatarInitial: 'A', roleChip: 'Super Admin · All Departments', showAdminSection: true },
  head: { userName: 'Amit', userRole: 'Department Head · Programs', avatarInitial: 'V', roleChip: 'Department Head · Programs', showAdminSection: false },
};

export default function TaskBoard() {
  const isAdmin = localStorage.getItem('st_role') === 'admin';
  const [role] = useState(isAdmin ? 'super' : 'head');
  const shell = ROLE_SHELL[role];

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [meta, setMeta] = useState({ statuses: [], departments: [], myDepartment: null });
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [draggedId, setDraggedId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const [detailTask, setDetailTask] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);

  const [hoursTarget, setHoursTarget] = useState(null); // { task, hours }
  const [hoursValue, setHoursValue] = useState('');
  const [hoursBusy, setHoursBusy] = useState(false);
  const [hoursError, setHoursError] = useState('');

  const [revisionTarget, setRevisionTarget] = useState(null);
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [revisionBusy, setRevisionBusy] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignable, setAssignable] = useState([]);
  const [assignForm, setAssignForm] = useState({ applicationId: '', title: '', description: '', dueDate: '', reportingPerson: '', submissionInstructions: '' });
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState('');

  useEffect(() => {
    apiRequest('/tasks/meta').then(setMeta).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    const query = new URLSearchParams({
      limit: '200',
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(deptFilter !== 'all' ? { department: deptFilter } : {}),
    });
    apiRequest(`/tasks?${query.toString()}`)
      .then((data) => { setTasks(data.tasks); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [search, deptFilter]);

  const openAssignModal = () => {
    setAssignError('');
    setAssignForm({ applicationId: '', title: '', description: '', dueDate: '', reportingPerson: '', submissionInstructions: '' });
    apiRequest('/tasks/assignable').then((data) => setAssignable(data.applications || [])).catch(() => setAssignable([]));
    setAssignOpen(true);
  };

  const submitAssign = async () => {
    const { applicationId, title, description, dueDate, reportingPerson } = assignForm;
    if (!applicationId || !title || !description || !dueDate || !reportingPerson) {
      setAssignError('Volunteer, task title, description, due date, and reporting person are all required.');
      return;
    }
    setAssignBusy(true);
    setAssignError('');
    try {
      await apiRequest('/tasks', { method: 'POST', body: JSON.stringify(assignForm) });
      setAssignOpen(false);
      load();
    } catch (err) {
      setAssignError(err.message);
    } finally {
      setAssignBusy(false);
    }
  };

  const patchStatus = async (task, status, extra = {}) => {
    await apiRequest(`/tasks/${task.id}/status`, { method: 'PATCH', body: JSON.stringify({ status, ...extra }) });
    load();
  };

  const handleDrop = async (colId) => {
    setDragOverCol(null);
    const task = tasks.find((t) => t.id === draggedId);
    setDraggedId(null);
    if (!task || task.status === 'completed' || task.status === colId) return;

    if (colId === 'completed') {
      setHoursTarget(task);
      setHoursValue('');
      setHoursError('');
      return;
    }
    if (colId === 'revision') {
      // Same reasoning as the 'completed' branch above: dropping straight
      // onto this column used to silently PATCH status to 'revision' with
      // no feedback at all, since patchStatus's default `extra = {}` sends
      // no `feedback` field — so no comment ever appeared for the
      // volunteer, and (previously) no email fired either. Routing through
      // the same Request Revision modal the "Request Revision" button
      // opens keeps drag-and-drop and the button consistent, and gives the
      // admin/manager a chance to actually explain what needs to change.
      setRevisionTarget(task);
      setRevisionFeedback('');
      return;
    }
    try {
      await patchStatus(task, colId);
    } catch (err) {
      setError(err.message);
    }
  };

  const confirmHours = async () => {
    const hours = parseFloat(hoursValue);
    if (!hours || hours <= 0) {
      setHoursError('Enter contribution hours before approving this task.');
      return;
    }
    setHoursBusy(true);
    setHoursError('');
    try {
      await patchStatus(hoursTarget, 'completed', { contributionHours: hours });
      setHoursTarget(null);
      setDetailTask(null);
    } catch (err) {
      setHoursError(err.message);
    } finally {
      setHoursBusy(false);
    }
  };

  const confirmRevision = async () => {
    setRevisionBusy(true);
    try {
      await patchStatus(revisionTarget, 'revision', { feedback: revisionFeedback });
      setRevisionTarget(null);
      setRevisionFeedback('');
      setDetailTask(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setRevisionBusy(false);
    }
  };

  const submitComment = async () => {
    if (!detailTask || !newComment.trim()) return;
    setCommentBusy(true);
    try {
      const data = await apiRequest(`/tasks/${detailTask.id}/comments`, { method: 'POST', body: JSON.stringify({ text: newComment }) });
      setDetailTask(data.task);
      setNewComment('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCommentBusy(false);
    }
  };

  return (
    <div className="dash-page page-task-board">
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
            <a className="nav-item" href="/applications"><span className="icon">📋</span>Applications</a>
            <a className="nav-item active" href="/task-board"><span className="icon">🗂️</span>Task Board</a>
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
          <div className="topbar-title">Task Board</div>
          <div className="topbar-right">
            <span className="topbar-role-chip">{shell.roleChip}</span>
            <ProfileMenu avatarInitial={shell.avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
          </div>
        </div>

        <div className="content">
          <div className="page-head">
            <div>
              <h1>Task Board</h1>
              <p>Kanban visualisation of the Track B task lifecycle{meta.myDepartment ? ` · ${meta.myDepartment}` : ' · all departments'}</p>
            </div>
            <button className="btn-primary" onClick={openAssignModal}>+ Assign Task</button>
          </div>
          <div className="field-hint" style={{ marginBottom: 14 }}>Tasks are created here only after an application has been moved to Shortlisted on the Applications screen.</div>

          <div className="filter-bar">
            <div className="search-wrap">
              <span className="s-icon">🔍</span>
              <input type="text" placeholder="Search volunteer, task, or opportunity…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {!meta.myDepartment && (
              <select className="filter-select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                <option value="all">All Departments</option>
                {meta.departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          </div>

          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="loading-state">
              <div className="skeleton skel-row" />
              <div className="skeleton skel-row" />
              <div className="skeleton skel-row" />
            </div>
          ) : (
            <div className="board">
              {COLUMNS.map((col) => {
                const colTasks = tasks.filter((t) => t.status === col.id);
                return (
                  <div
                    key={col.id}
                    className={`board-col ${dragOverCol === col.id ? 'dragover' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
                    onDragLeave={() => setDragOverCol((c) => (c === col.id ? null : c))}
                    onDrop={() => handleDrop(col.id)}
                  >
                    <h4>{col.label} <span className="count">{colTasks.length}</span></h4>
                    {colTasks.length === 0 ? (
                      <div className="empty-state"><p>No tasks here</p></div>
                    ) : (
                      colTasks.map((t) => (
                        <div
                          key={t.id}
                          className="task-card"
                          draggable={t.status !== 'completed'}
                          onDragStart={() => setDraggedId(t.id)}
                          onClick={() => setDetailTask(t)}
                        >
                          <h5>{t.title}</h5>
                          <div className="t-meta">👤 {t.volunteer.name}</div>
                          <div className="t-meta">📅 Due {formatDate(t.dueDate)}</div>
                          <span className="dept-chip t-dept">{t.department}</span>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* TASK DETAIL / REVIEW MODAL */}
      {detailTask && (
        <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) setDetailTask(null); }}>
          <div className="modal-box">
            <h2>{detailTask.title}</h2>
            <div className="m-sub">{detailTask.volunteer.name} · {detailTask.opportunity.title} · {detailTask.department}</div>

            <div className="field-group"><label className="field-label">Description</label><p style={{ fontSize: 13.5, color: 'var(--gray-800)' }}>{detailTask.description}</p></div>
            <div className="field-group"><label className="field-label">Due Date</label><input className="field-input" value={formatDate(detailTask.dueDate)} readOnly /></div>
            <div className="field-group"><label className="field-label">Reporting Person</label><input className="field-input" value={detailTask.reportingPerson} readOnly /></div>

            <div className="field-group">
              <label className="field-label">Submission</label>
              {detailTask.submission ? (
                <div>
                  {detailTask.submission.fileUrl && <p><a href={detailTask.submission.fileUrl} target="_blank" rel="noreferrer">📎 {detailTask.submission.fileName || 'Uploaded file'}</a></p>}
                  {detailTask.submission.link && <p><a href={detailTask.submission.link} target="_blank" rel="noreferrer">🔗 {detailTask.submission.link}</a></p>}
                  {detailTask.submission.note && <p style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 4 }}>{detailTask.submission.note}</p>}
                </div>
              ) : (
                <input className="field-input" value="Not submitted yet" readOnly />
              )}
            </div>

            <div className="field-group">
              <label className="field-label">Comments</label>
              {detailTask.comments.length === 0 ? (
                <div className="field-hint">No comments yet.</div>
              ) : (
                detailTask.comments.map((c, i) => (
                  <div className="comment-item" key={i}>
                    {c.text}
                    <div className="c-meta">{c.authorName || c.authorRole} · {formatDate(c.at)}</div>
                  </div>
                ))
              )}
              <textarea className="field-input" style={{ marginTop: 8, minHeight: 60 }} placeholder="Add a progress or review note…" value={newComment} onChange={(e) => setNewComment(e.target.value)} />
              <button className="btn-ghost" style={{ marginTop: 8 }} disabled={commentBusy || !newComment.trim()} onClick={submitComment}>{commentBusy ? 'Adding…' : 'Add Comment'}</button>
            </div>

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setDetailTask(null)}>Close</button>
              {detailTask.status === 'submitted' && (
                <>
                  <button className="btn-ghost warn" onClick={() => { setRevisionTarget(detailTask); setRevisionFeedback(''); }}>Request Revision</button>
                  <button className="btn-primary" onClick={() => { setHoursTarget(detailTask); setHoursValue(''); setHoursError(''); }}>Approve — Generate Certificate</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONTRIBUTION HOURS MODAL (drag-to-Completed or Approve) */}
      {hoursTarget && (
        <div className="modal-overlay show">
          <div className="modal-card">
            <h3>Approve Task</h3>
            <p>Enter the volunteer's contribution hours to approve <strong>{hoursTarget.title}</strong> and generate their certificate.</p>
            <div className="field-group">
              <label className="field-label">Contribution Hours</label>
              <input type="number" className="field-input" min="1" placeholder="e.g. 6" value={hoursValue} onChange={(e) => setHoursValue(e.target.value)} />
            </div>
            {hoursError && <p className="form-error">{hoursError}</p>}
            <div className="modal-btns">
              <button className="btn-cancel" onClick={() => setHoursTarget(null)} disabled={hoursBusy}>Cancel</button>
              <button className="btn-confirm" onClick={confirmHours} disabled={hoursBusy}>{hoursBusy ? 'Approving…' : 'Approve'}</button>
            </div>
          </div>
        </div>
      )}

      {/* REQUEST REVISION MODAL */}
      {revisionTarget && (
        <div className="modal-overlay show">
          <div className="modal-card">
            <h3>Request Revision</h3>
            <p>Tell <strong>{revisionTarget.volunteer.name}</strong> what needs to change on <strong>{revisionTarget.title}</strong>.</p>
            <div className="field-group">
              <label className="field-label">Feedback <span className="field-optional">(shown as a comment and included in the volunteer's email — optional, but recommended)</span></label>
              <textarea className="field-input" rows={3} value={revisionFeedback} onChange={(e) => setRevisionFeedback(e.target.value)} placeholder="e.g. Please shorten each caption to under 150 characters…" />
            </div>
            <div className="modal-btns">
              <button className="btn-cancel" onClick={() => setRevisionTarget(null)} disabled={revisionBusy}>Cancel</button>
              <button className="btn-confirm" onClick={confirmRevision} disabled={revisionBusy}>{revisionBusy ? 'Sending…' : 'Send Back for Revision'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN TASK MODAL */}
      {assignOpen && (
        <div className="modal-overlay show">
          <div className="modal-box">
            <h2>Assign Task</h2>
            <div className="m-sub">Create a task for a Shortlisted volunteer</div>

            <div className="field-group">
              <label className="field-label">Volunteer <span className="field-required">*</span></label>
              <select className="field-input" value={assignForm.applicationId} onChange={(e) => setAssignForm((f) => ({ ...f, applicationId: e.target.value }))}>
                <option value="">Select a Shortlisted application…</option>
                {assignable.map((a) => <option key={a.id} value={a.id}>{a.volunteerName} — {a.opportunityTitle}</option>)}
              </select>
              {assignable.length === 0 && <div className="field-hint">No Shortlisted applications are waiting for a task right now.</div>}
            </div>
            <div className="field-group">
              <label className="field-label">Task Title <span className="field-required">*</span></label>
              <input type="text" className="field-input" placeholder="e.g. Draft July donor newsletter" value={assignForm.title} onChange={(e) => setAssignForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="field-group">
              <label className="field-label">Description <span className="field-required">*</span></label>
              <textarea className="field-input" placeholder="What should the volunteer do?" value={assignForm.description} onChange={(e) => setAssignForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="field-row">
              <div className="field-group"><label className="field-label">Due Date <span className="field-required">*</span></label><input type="date" className="field-input" value={assignForm.dueDate} onChange={(e) => setAssignForm((f) => ({ ...f, dueDate: e.target.value }))} /></div>
              <div className="field-group"><label className="field-label">Reporting Person <span className="field-required">*</span></label><input type="text" className="field-input" placeholder="e.g. Priyanka Negi Bhandari" value={assignForm.reportingPerson} onChange={(e) => setAssignForm((f) => ({ ...f, reportingPerson: e.target.value }))} /></div>
            </div>
            <div className="field-group">
              <label className="field-label">Submission Instructions <span className="field-optional">(optional, e.g. a Drive folder)</span></label>
              <input type="text" className="field-input" placeholder="https://drive.google.com/…" value={assignForm.submissionInstructions} onChange={(e) => setAssignForm((f) => ({ ...f, submissionInstructions: e.target.value }))} />
            </div>
            {assignError && <p className="form-error">{assignError}</p>}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setAssignOpen(false)} disabled={assignBusy}>Cancel</button>
              <button className="btn-primary" onClick={submitAssign} disabled={assignBusy}>{assignBusy ? 'Assigning…' : 'Assign Task'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
