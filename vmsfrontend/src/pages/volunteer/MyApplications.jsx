import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPatch, apiPostForm } from './api';
import './MyApplications.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Converted from 11-my-applications.html, wired to the real backend
 * (GET/PATCH /volunteer/applications). See
 * controllers/volunteerApplicationController.js for the status pipeline
 * this renders.
 *
 * Adapted from the mockup:
 * - The mockup's Track A example ("Tree Planting Diary") was already shown
 *   fully Completed with a certificate — here a Track A card in the
 *   'claimed' state gets a real "Submit Your Work" modal (photo-or-Drive-
 *   link + a short write-up) instead. That same submission action is also
 *   reachable from My Tasks now (MyTasks.jsx) — both hit the same
 *   POST /volunteer/applications/:id/submit endpoint, which now uploads the
 *   photo to a real DigitalOcean Spaces bucket (or stores a pasted Drive
 *   link as-is) rather than a base64 data URL.
 * - "View →" navigates to the real opportunity detail page
 *   (/find-opportunities/:id) rather than a static mockup link.
 */

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'a', label: 'Track A' },
  { key: 'b', label: 'Track B' },
];

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MyApplications() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [applications, setApplications] = useState([]);
  const [counts, setCounts] = useState({ all: 0, active: 0, completed: 0, trackA: 0, trackB: 0 });
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [withdrawTarget, setWithdrawTarget] = useState(null); // application object
  const [withdrawing, setWithdrawing] = useState(false);

  const [submitTarget, setSubmitTarget] = useState(null); // application object
  const [submitText, setSubmitText] = useState('');
  const [submitPhotoFile, setSubmitPhotoFile] = useState(null);
  const [submitPreview, setSubmitPreview] = useState('');
  const [submitLink, setSubmitLink] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  const photoInputRef = useRef(null);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter === 'active' || filter === 'completed') params.set('status', filter);
    if (filter === 'a' || filter === 'b') params.set('track', filter);
    apiGet(`/volunteer/applications?${params.toString()}`)
      .then((data) => {
        setApplications(data.applications || []);
        setCounts(data.counts || {});
        setError('');
      })
      .catch((err) => setError(err.message || 'Could not load your applications.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [filter]);

  const confirmWithdraw = async () => {
    if (!withdrawTarget) return;
    setWithdrawing(true);
    try {
      await apiPatch(`/volunteer/applications/${withdrawTarget.id}/withdraw`);
      setWithdrawTarget(null);
      load();
    } catch (err) {
      setError(err.message || 'Could not withdraw this application.');
    } finally {
      setWithdrawing(false);
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setSubmitPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setSubmitPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const resetSubmitForm = () => {
    setSubmitTarget(null);
    setSubmitText('');
    setSubmitPhotoFile(null);
    setSubmitPreview('');
    setSubmitLink('');
    setSubmitErr('');
  };

  const confirmSubmit = async () => {
    if (!submitTarget) return;
    if (!submitPhotoFile && !submitLink.trim()) {
      setSubmitErr('Attach a photo or paste a Google Drive link to complete this submission.');
      return;
    }
    setSubmitting(true);
    setSubmitErr('');
    try {
      const form = new FormData();
      if (submitPhotoFile) form.append('photo', submitPhotoFile);
      if (submitLink.trim()) form.append('driveLink', submitLink.trim());
      form.append('text', submitText);
      await apiPostForm(`/volunteer/applications/${submitTarget.id}/submit`, form);
      resetSubmitForm();
      load();
    } catch (err) {
      setSubmitErr(err.message || 'Could not submit your work.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="volunteer-shell page-my-applications">
      {withdrawTarget && (
        <div className="modal-overlay open">
          <div className="modal-card">
            <h3>Withdraw Application?</h3>
            <p>Are you sure you want to withdraw your application for <strong>{withdrawTarget.opportunity.title}</strong>? This action cannot be undone.</p>
            <div className="modal-btns">
              <button className="btn-cancel" onClick={() => setWithdrawTarget(null)} disabled={withdrawing}>Keep Application</button>
              <button className="btn-confirm-withdraw" onClick={confirmWithdraw} disabled={withdrawing}>
                {withdrawing ? 'Withdrawing…' : 'Yes, Withdraw'}
              </button>
            </div>
          </div>
        </div>
      )}

      {submitTarget && (
        <div className="modal-overlay open">
          <div className="modal-card modal-card-wide">
            <h3>Submit Your Work</h3>
            <p>Add a photo and a short note for <strong>{submitTarget.opportunity.title}</strong>. Your certificate is issued the moment you submit — no review wait.</p>
            <div className="submit-field">
              <label>Photo <span className="opt">(or paste a Drive link below)</span></label>
              <input type="file" accept="image/*" ref={photoInputRef} onChange={handlePhotoChange} style={{ display: 'none' }} />
              <button className="btn-ghost" onClick={() => photoInputRef.current?.click()}>
                {submitPreview ? '✓ Photo selected — change' : '📸 Choose a photo'}
              </button>
              {submitPreview && <img src={submitPreview} alt="Preview" className="submit-photo-preview" />}
            </div>
            <div className="submit-field">
              <label>Or paste a Google Drive link <span className="opt">(optional)</span></label>
              <input type="url" className="field-input" placeholder="https://drive.google.com/…" value={submitLink} onChange={(e) => setSubmitLink(e.target.value)} />
            </div>
            <div className="submit-field">
              <label>Short note <span className="opt">(optional)</span></label>
              <textarea rows={3} value={submitText} onChange={(e) => setSubmitText(e.target.value)} placeholder="What did you do?" />
            </div>
            {submitErr && <p className="form-error">{submitErr}</p>}
            <div className="modal-btns">
              <button className="btn-cancel" onClick={resetSubmitForm} disabled={submitting}>Cancel</button>
              <button className="btn-view" onClick={confirmSubmit} disabled={submitting}>
                {submitting ? 'Submitting…' : '🏅 Submit & Get Certificate'}
              </button>
            </div>
          </div>
        </div>
      )}

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
            <a className="nav-item active">
              <span className="icon">📋</span>My Applications {counts.active > 0 && <span className="badge">{counts.active}</span>}
            </a>
            <a className="nav-item" onClick={() => navigate('/my-tasks')}><span className="icon">✅</span>My Tasks</a>
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
          <div className="topbar-title">My Applications</div>
        <div className="topbar-right">
          <ProfileMenu avatarClassName="avatar" profilePath="/my-profile" />
        </div>
        </div>

        <div className="content">
          <div className="filter-tabs">
            {FILTERS.map((f) => (
              <button key={f.key} className={`filter-tab ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
                {f.label} {f.key === 'all' ? `(${counts.all || 0})` : f.key === 'active' ? `(${counts.active || 0})` : f.key === 'completed' ? `(${counts.completed || 0})` : f.key === 'a' ? `(${counts.trackA || 0})` : `(${counts.trackB || 0})`}
              </button>
            ))}
          </div>

          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="empty-state"><div className="e-icon">📋</div><p>Loading your applications…</p></div>
          ) : applications.length === 0 ? (
            <div className="empty-state">
              <div className="e-icon">📋</div>
              <p>No applications here yet.</p>
              <div className="e-note">Browse opportunities and apply — they'll show up here.</div>
              <button className="btn-primary" style={{ marginTop: 14, maxWidth: 220 }} onClick={() => navigate('/find-opportunities')}>Find Opportunities</button>
            </div>
          ) : (
            applications.map((app) => (
              <div className="app-card" key={app.id}>
                <div className="app-card-top">
                  <h3>{app.opportunity.title}</h3>
                </div>
                <div className="chips-row">
                  <span className={`chip chip-track-${app.track}`}>{app.track === 'a' ? '🌱 Track A · Evergreen' : 'Track B · Skilled'}</span>
                  <span className={`chip chip-${app.chip.variant}`}>{app.chip.label}</span>
                </div>

                <div className="status-timeline">
                  {app.timeline.map((step, i) => (
                    <div className="st-col-wrap" key={step.key}>
                      <div className="st-col">
                        <div className={`st-dot ${step.state}`}>{step.state === 'done' ? '✓' : step.state === 'current' ? '●' : i + 1}</div>
                        <div className="st-label">{step.label}</div>
                      </div>
                      {i < app.timeline.length - 1 && <div className={`st-line ${step.state === 'done' ? 'done' : ''}`} />}
                    </div>
                  ))}
                </div>

                <div className="app-meta-row">
                  <span className="meta-item"><span className="m-icon">📅</span>Applied {formatDate(app.appliedAt)}</span>
                  <span className="meta-item">
                    <span className="m-icon">{app.opportunity.mode === 'Remote' ? '🌐' : '🏞️'}</span>
                    {app.opportunity.mode} ·{' '}
                    {app.opportunity.timeCommitment
                      ? `${app.opportunity.timeCommitment} hrs/week`
                      : app.opportunity.duration
                      ? `${app.opportunity.duration} wk${app.opportunity.duration === 1 ? '' : 's'}`
                      : 'Flexible'}
                  </span>
                </div>

                <div className="app-footer">
                  <div className="next-step">→ {app.nextStep}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {app.canSubmit && (
                      <button className="btn-view" style={{ background: 'var(--gold)' }} onClick={() => setSubmitTarget(app)}>Submit Work 📸</button>
                    )}
                    {app.canWithdraw && (
                      <button className="btn-withdraw" onClick={() => setWithdrawTarget(app)}>Withdraw</button>
                    )}
                    {app.certificateIssued ? (
                      <button className="btn-view" style={{ background: 'var(--gold)', cursor: 'not-allowed', opacity: 0.85 }} disabled title="A dedicated Certificates page isn't built yet">
                        🏅 Certificate Issued
                      </button>
                    ) : (
                      <button className="btn-view" onClick={() => navigate(`/find-opportunities/${app.opportunity.id}`)}>View →</button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
