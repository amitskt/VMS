import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost, apiPostForm } from './api';
import './MyTasks.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Converted from 12-my-tasks.html, wired to the real backend
 * (GET /volunteer/tasks, POST /volunteer/tasks/:id/submit,
 * POST /volunteer/applications/:id/submit). See
 * controllers/volunteerTaskController.js's file header for why the two
 * sections below read from two different sources rather than one unified
 * "task" list — Track A has no separate Task document (its whole lifecycle
 * lives on the Application itself), Track B only shows up once a
 * manager/admin has actually assigned a task from the Task Board.
 *
 * Adapted from the mockup:
 * - Both sections now support "upload a file OR paste a link" (Google
 *   Drive/Docs) for submission, backed by a real DigitalOcean Spaces bucket
 *   for uploads (utils/spacesUpload.js on the backend) rather than the
 *   mockup's photo-thumbnail-only flow.
 * - Track A here still requires a photo or Drive link (no free-text-only
 *   submission) and a short story, same rule as MyApplications.jsx's
 *   existing "Submit Work" modal — this page is simply a second place that
 *   same action is reachable from, not a different rule.
 * - No multi-file "min 3 photos" flow (the mockup's Tree Planting Diary
 *   card) — Application.submission only ever stores one photo/link, matching
 *   what's already shipped and tested on MyApplications.jsx; a genuine
 *   multi-photo gallery would need a schema change out of scope here.
 * - Comments are real (POST /volunteer/tasks/:id/comments) so a volunteer
 *   can reply to a coordinator's revision feedback instead of just reading it.
 */

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MyTasks() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [trackA, setTrackA] = useState([]);
  const [trackB, setTrackB] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Track A submission state, keyed by application id.
  const [aText, setAText] = useState({});
  const [aPhoto, setAPhoto] = useState({}); // { [id]: File }
  const [aPreview, setAPreview] = useState({});
  const [aLink, setALink] = useState({});
  const [aBusy, setABusy] = useState(null);
  const [aError, setAError] = useState({});
  const photoInputRefs = useRef({});

  // Track B submission state, keyed by task id.
  const [bLink, setBLink] = useState({});
  const [bNote, setBNote] = useState({});
  const [bFile, setBFile] = useState({});
  const [bBusy, setBBusy] = useState(null);
  const [bError, setBError] = useState({});
  const [bComment, setBComment] = useState({});
  const fileInputRefs = useRef({});

  const load = () => {
    setLoading(true);
    apiGet('/volunteer/tasks')
      .then((data) => { setTrackA(data.trackA || []); setTrackB(data.trackB || []); setError(''); })
      .catch((err) => setError(err.message || 'Could not load your tasks.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAPhoto = (id, file) => {
    if (!file) return;
    setAPhoto((p) => ({ ...p, [id]: file }));
    const reader = new FileReader();
    reader.onload = (ev) => setAPreview((p) => ({ ...p, [id]: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const submitTrackA = async (app) => {
    const photo = aPhoto[app.id];
    const link = (aLink[app.id] || '').trim();
    if (!photo && !link) {
      setAError((e) => ({ ...e, [app.id]: 'Attach a photo or paste a Google Drive link.' }));
      return;
    }
    setABusy(app.id);
    setAError((e) => ({ ...e, [app.id]: '' }));
    try {
      const form = new FormData();
      if (photo) form.append('photo', photo);
      if (link) form.append('driveLink', link);
      form.append('text', aText[app.id] || '');
      await apiPostForm(`/volunteer/applications/${app.id}/submit`, form);
      load();
    } catch (err) {
      setAError((e) => ({ ...e, [app.id]: err.message || 'Could not submit your work.' }));
    } finally {
      setABusy(null);
    }
  };

  const submitTrackB = async (task) => {
    const file = bFile[task.id];
    const link = (bLink[task.id] || '').trim();
    if (!file && !link) {
      setBError((e) => ({ ...e, [task.id]: 'Attach a file or paste a link.' }));
      return;
    }
    setBBusy(task.id);
    setBError((e) => ({ ...e, [task.id]: '' }));
    try {
      const form = new FormData();
      if (file) form.append('file', file);
      if (link) form.append('link', link);
      form.append('note', bNote[task.id] || '');
      await apiPostForm(`/volunteer/tasks/${task.id}/submit`, form);
      load();
    } catch (err) {
      setBError((e) => ({ ...e, [task.id]: err.message || 'Could not submit this task.' }));
    } finally {
      setBBusy(null);
    }
  };

  const addTaskComment = async (task) => {
    const text = (bComment[task.id] || '').trim();
    if (!text) return;
    try {
      await apiPost(`/volunteer/tasks/${task.id}/comments`, { text });
      setBComment((c) => ({ ...c, [task.id]: '' }));
      load();
    } catch (err) {
      setBError((e) => ({ ...e, [task.id]: err.message }));
    }
  };

  const claimedTrackA = trackA.filter((a) => a.status === 'claimed');
  const otherTrackA = trackA.filter((a) => a.status !== 'claimed');
  const totalBadge = claimedTrackA.length + trackB.filter((t) => t.canSubmit).length;

  return (
    <div className="volunteer-shell page-my-tasks">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-wrap"><div className="logo-lockup">
              <span className="logo-word">STart</span>
              <span className="logo-sub">by SankalpTaru</span>
            </div></div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">Main</div>
            <a className="nav-item" onClick={() => navigate('/dashboard')}><span className="icon">🏠</span>Dashboard</a>
            <a className="nav-item" onClick={() => navigate('/find-opportunities')}><span className="icon">🔍</span>Opportunities</a>
          </div>
          <div className="nav-section">
            <div className="nav-section-title">My Volunteering</div>
            <a className="nav-item" onClick={() => navigate('/my-applications')}><span className="icon">📋</span>My Applications</a>
            <a className="nav-item active"><span className="icon">✅</span>My Tasks {totalBadge > 0 && <span className="badge">{totalBadge}</span>}</a>
            <a className="nav-item" onClick={() => navigate('/saved')}><span className="icon">🔖</span>Saved</a>
          </div>
          <div className="nav-section">
            <div className="nav-section-title">Progress</div>
            <a className="nav-item" onClick={() => navigate('/my-engagement')}><span className="icon">📊</span>My Engagement</a>
            <a className="nav-item" onClick={() => navigate('/my-certificates')}><span className="icon">🏅</span>Certificates</a>
          </div>
          <div className="nav-section">
            <div className="nav-section-title">Account</div>
            <a className="nav-item" onClick={() => navigate('/edit-profile')}><span className="icon">⚙️</span>Profile Settings</a>
          </div>
        </nav>
      </aside>
      <div className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
          <div className="topbar-title">My Tasks</div>
        <div className="topbar-right">
          <ProfileMenu avatarClassName="avatar" profilePath="/my-profile" />
        </div>
        </div>

        <div className="content">
          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="empty-state"><div className="e-icon">✅</div><p>Loading your tasks…</p></div>
          ) : (
            <>
              <div className="section-header">
                <h2>🌱 Track A — Evergreen Tasks</h2>
                <span className="section-badge badge-a">Auto-approved on submission</span>
              </div>

              {trackA.length === 0 ? (
                <div className="empty-state">
                  <div className="e-icon">🌱</div>
                  <h3>No evergreen tasks yet</h3>
                  <p>Claim a Track A opportunity from Opportunities to see it here.</p>
                </div>
              ) : (
                <>
                  {claimedTrackA.map((app) => (
                    <div className="task-card" key={app.id}>
                      <div className="task-card-top">
                        <h3>{app.opportunity.title}</h3>
                        <span className="status-chip chip-inprogress">In Progress</span>
                      </div>
                      <div className="task-meta">
                        <span className="meta-tag">📅 No deadline — anytime</span>
                        <span className="meta-tag">🌿 Submit a photo (or Drive link) + write-up</span>
                        <span className="meta-tag">🏅 Certificate auto-generated</span>
                      </div>

                      <div className="upload-section">
                        <label>Upload a Photo</label>
                        <div className="upload-drop" onClick={() => photoInputRefs.current[app.id]?.click()}>
                          <input
                            type="file"
                            accept="image/*"
                            ref={(el) => (photoInputRefs.current[app.id] = el)}
                            style={{ display: 'none' }}
                            onChange={(e) => handleAPhoto(app.id, e.target.files && e.target.files[0])}
                          />
                          <div className="ud-icon">📸</div>
                          <h4>{aPhoto[app.id] ? '✓ Photo selected — click to change' : 'Click to choose a photo'}</h4>
                          <p>JPG, PNG · max 15MB</p>
                        </div>
                        {aPreview[app.id] && <div className="photos-row"><img className="photo-thumb-img" src={aPreview[app.id]} alt="Preview" /></div>}
                        <div className="or-divider"><span>or paste a Google Drive link</span></div>
                        <input type="url" className="link-input" placeholder="https://drive.google.com/…" value={aLink[app.id] || ''} onChange={(e) => setALink((l) => ({ ...l, [app.id]: e.target.value }))} />
                      </div>

                      <div className="upload-section" style={{ marginBottom: 14 }}>
                        <label>Your Planting Story <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(optional)</span></label>
                        <textarea className="story-area" maxLength={300} placeholder="Tell us about your experience…" value={aText[app.id] || ''} onChange={(e) => setAText((t) => ({ ...t, [app.id]: e.target.value }))} />
                        <div className="char-note">{(aText[app.id] || '').length} / 300 characters</div>
                      </div>

                      {aError[app.id] && <p className="form-error">{aError[app.id]}</p>}
                      <button className="btn-submit" disabled={aBusy === app.id} onClick={() => submitTrackA(app)}>
                        {aBusy === app.id ? '⏳ Submitting…' : '🌱 Submit My Work →'}
                      </button>
                    </div>
                  ))}

                  {otherTrackA.map((app) => (
                    <div className="task-card completed" key={app.id}>
                      <div className="task-card-top">
                        <h3>{app.opportunity.title}</h3>
                        <span className="status-chip chip-completed">✓ {app.chip.label}</span>
                      </div>
                      <div className="task-meta">
                        <span className="meta-tag">✅ Submitted {formatDate(app.submission?.submittedAt)}</span>
                        {app.certificateIssued && <span className="meta-tag">🏅 Certificate issued</span>}
                        <span className="meta-tag">🌱 Track A · Auto-approved</span>
                      </div>
                      {app.certificateIssued && (
                        <div style={{ background: 'var(--sage)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--forest)' }}>🎉 This task is complete! Your certificate has been generated.</p>
                          <button className="btn-view-cert" onClick={() => navigate('/my-applications')}>View in My Applications →</button>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}

              <div className="section-header" style={{ marginTop: 28 }}>
                <h2>🎯 Track B — Skilled Tasks</h2>
                <span className="section-badge badge-b">Manager review required</span>
              </div>

              {trackB.length === 0 ? (
                <div className="empty-state">
                  <div className="e-icon">🎯</div>
                  <h3>No tasks assigned yet</h3>
                  <p>Once a manager assigns you a task for a Shortlisted application, it'll show up here.</p>
                  <button className="e-btn" onClick={() => navigate('/my-applications')}>View My Applications</button>
                </div>
              ) : (
                trackB.map((t) => (
                  <div className={`task-card ${t.status === 'revision' ? 'revision' : ''} ${t.status === 'completed' ? 'completed' : ''}`} key={t.id}>
                    <div className="task-card-top">
                      <h3>{t.title}</h3>
                      <span className={`status-chip chip-${t.status}`}>
                        {t.status === 'revision' ? '⚠️ Revision Needed' : t.status === 'completed' ? '✓ Completed' : t.status === 'submitted' ? '📤 Submitted' : t.statusLabel}
                      </span>
                    </div>
                    <div className="task-meta">
                      <span className="meta-tag">📅 Due: {formatDate(t.dueDate)}</span>
                      <span className="meta-tag">👤 Reporting to: {t.reportingPerson}</span>
                      <span className="meta-tag">🎯 {t.opportunity.title}</span>
                    </div>

                    <div className="task-detail-grid">
                      <div className="detail-field"><label>Task Description</label><p>{t.description}</p></div>
                      <div className="detail-field"><label>Reporting Person</label><p>{t.reportingPerson}</p></div>
                      {t.submissionInstructions && <div className="detail-field"><label>Submission Instructions</label><p>{t.submissionInstructions}</p></div>}
                      <div className="detail-field"><label>Due Date</label><p>{formatDate(t.dueDate)}</p></div>
                    </div>

                    {t.comments.length > 0 && (
                      <div className="comments-block">
                        {t.comments.map((c, i) => (
                          <div className={`comment-item ${c.authorRole !== 'volunteer' ? 'from-staff' : ''}`} key={i}>
                            <strong>{c.authorName}</strong>: {c.text}
                            <div className="c-meta">{formatDate(c.at)}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {t.status === 'completed' ? (
                      <div style={{ background: 'var(--sage)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--forest)' }}>🎉 Approved{t.contributionHours ? ` — ${t.contributionHours} hrs logged` : ''}! Your certificate has been generated.</p>
                      </div>
                    ) : t.status === 'submitted' ? (
                      <div className="field-hint">Submitted — waiting on manager review.</div>
                    ) : (
                      <>
                        <div className="upload-section">
                          <label>{t.status === 'revision' ? 'Submit Revised Work' : 'Submit Your Work'}</label>
                          <div className="upload-drop" onClick={() => fileInputRefs.current[t.id]?.click()}>
                            <input type="file" accept=".pdf,.doc,.docx,image/*" ref={(el) => (fileInputRefs.current[t.id] = el)} style={{ display: 'none' }} onChange={(e) => setBFile((f) => ({ ...f, [t.id]: e.target.files && e.target.files[0] }))} />
                            <div className="ud-icon">📄</div>
                            <h4>{bFile[t.id] ? `✓ ${bFile[t.id].name}` : 'Click to choose a file'}</h4>
                            <p>PDF, DOC, DOCX, image · max 15MB</p>
                          </div>
                          <div className="or-divider"><span>or paste a link</span></div>
                          <input type="url" className="link-input" placeholder="https://docs.google.com/…" value={bLink[t.id] || ''} onChange={(e) => setBLink((l) => ({ ...l, [t.id]: e.target.value }))} />
                          <textarea className="story-area" style={{ marginTop: 10, minHeight: 60 }} placeholder="Add a note (optional)" value={bNote[t.id] || ''} onChange={(e) => setBNote((n) => ({ ...n, [t.id]: e.target.value }))} />
                        </div>
                        {bError[t.id] && <p className="form-error">{bError[t.id]}</p>}
                        <button className={`btn-submit ${t.status === 'revision' ? 'resubmit' : ''}`} disabled={bBusy === t.id} onClick={() => submitTrackB(t)}>
                          {bBusy === t.id ? '⏳ Submitting…' : t.status === 'revision' ? '🔄 Resubmit Revised Work →' : '📤 Submit Task →'}
                        </button>
                      </>
                    )}

                    {t.status !== 'completed' && (
                      <div className="add-comment-row">
                        <input type="text" className="link-input" placeholder="Add a comment or question…" value={bComment[t.id] || ''} onChange={(e) => setBComment((c) => ({ ...c, [t.id]: e.target.value }))} />
                        <button className="btn-ghost-sm" disabled={!(bComment[t.id] || '').trim()} onClick={() => addTaskComment(t)}>Send</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
