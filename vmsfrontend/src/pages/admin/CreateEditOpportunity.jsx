import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './CreateEditOpportunity.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Converted from admin-04-create-edit-opportunity.html, wired to the real
 * backend (controllers/opportunityController.js,
 * routes/opportunitiesAdminRoutes.js) — replaces the earlier frontend-only
 * pass that used an in-memory mock (opportunitiesData.js is no longer
 * imported here; it can be deleted). See Opportunities.jsx for the same
 * apiRequest / token-auth pattern.
 *
 * DEPARTMENT SCOPING (the actual rule requested): a Department Head
 * (manager) can only create or edit opportunities under their own
 * department. This is enforced authoritatively server-side
 * (opportunityController.js forces `depts` to the manager's real department
 * on every create/update, and 403s if a manager tries to open an
 * opportunity that isn't theirs) — the locked chip UI here is just a
 * reflection of that, not the actual guard.
 *
 * The manager's real department (`meta.myDepartment`) comes from
 * GET /opportunities/meta, which looks it up server-side from the Manager
 * collection — no more hardcoded MANAGER_DEPARTMENT placeholder.
 */

const BASE_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/admin`;

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
  if (!res.ok) {
    const err = new Error(data.message || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

// For the Related Documents upload — a plain FormData body, deliberately
// NOT run through apiRequest() above (which always sets
// Content-Type: application/json and JSON.stringifies the body). fetch
// sets the correct multipart Content-Type with boundary on its own as
// long as this never sets one explicitly — same pattern as
// pages/volunteer/api.js's apiPostForm.
async function apiUpload(path, formData) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('st_token')}` },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

const EMPTY_FORM = {
  title: '',
  overview: '',
  whatYouWillDo: '',
  whatYouWillLearn: '',
  mode: '',
  duration: '',
  timeCommitment: '',
  capacity: '',
  skills: [],
};

export default function CreateEditOpportunity() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  // Role comes from the real login session — see Volunteers.jsx / Opportunities.jsx
  // for the note on why this reads `st_role` instead of a `?role=` URL param.
  const isAdmin = localStorage.getItem('st_role') === 'admin';
  const isManager = !isAdmin;

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // departments/skills/modes + the resolved manager department, from the
  // backend's /opportunities/meta — nothing here is hardcoded. skillCategories
  // groups the same skills by category (same grouping/labels volunteers see
  // at registration in Skill.jsx) so Skills Required can render with
  // headings instead of one flat 36-chip list.
  const [meta, setMeta] = useState({ departments: [], skills: [], skillCategories: [], modes: [], myDepartment: null });

  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  const [existing, setExisting] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [track, setTrack] = useState('a');
  const [form, setForm] = useState(EMPTY_FORM);
  const [depts, setDepts] = useState([]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Related Documents (Track B only) — SRS/briefs/reference material a
  // manager attaches so volunteers can understand the project properly
  // (see OpportunityDetail.jsx). Uploads immediately on file selection,
  // independent of Save/Publish, same pattern as a volunteer's resume
  // upload on EditProfile.jsx — which is also why this only works once the
  // opportunity actually has an :id (a brand-new, unsaved one has nowhere
  // to attach a document to yet).
  const [documents, setDocuments] = useState([]);
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState('');
  const docInputRef = useRef(null);

  const [metaLoading, setMetaLoading] = useState(true);

  useEffect(() => {
    apiRequest('/opportunities/meta')
      .then(setMeta)
      .catch((err) => {
        // Unlike Opportunities.jsx, this page can't function without meta —
        // Mode/Skills/Owning Department all come from it. Surface the real
        // reason (route not found, stale token, manager account missing,
        // server unreachable) instead of silently leaving the pickers empty.
        setLoadError(err.message || 'Could not load Mode/Skills/Department options.');
      })
      .finally(() => setMetaLoading(false));
  }, []);

  // Managers are always locked to their own real department — once it's
  // known, force it into `depts`, regardless of whether we're creating a
  // new opportunity or editing one that an admin previously assigned to
  // more than one department.
  useEffect(() => {
    if (isManager && meta.myDepartment) {
      setDepts([meta.myDepartment]);
    }
  }, [isManager, meta.myDepartment]);

  useEffect(() => {
    if (!isEditing) return;
    apiRequest(`/opportunities/${id}`)
      .then((data) => {
        const opp = data.opportunity;
        setExisting(opp);
        setTrack(opp.track);
        setForm({
          title: opp.title,
          overview: opp.overview || '',
          whatYouWillDo: opp.whatYouWillDo || '',
          whatYouWillLearn: opp.whatYouWillLearn || '',
          mode: opp.mode || '',
          // `?? ''` rather than `|| ''` — timeCommitment can legitimately be
          // 0 (hrs/week), which `||` would wrongly blank out.
          duration: opp.duration ?? '',
          timeCommitment: opp.timeCommitment ?? '',
          capacity: opp.capacity || '',
          skills: opp.skills || [],
        });
        // Admin keeps whatever departments the opportunity actually has;
        // manager's depts are handled by the effect above instead.
        if (!isManager) setDepts(opp.depts || []);
        setDocuments(opp.documents || []);
      })
      .catch((err) => {
        if (err.status === 404) setNotFound(true);
        else if (err.status === 403) setForbidden(true);
        else setLoadError(err.message);
      })
      .finally(() => setLoadingExisting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEditing]);

  // Track cannot be changed once applications exist — the mockup shows this
  // hint but never actually wired it up; opportunityController.js enforces
  // it for real, this just mirrors the same rule in the UI.
  const trackLocked = isEditing && existing && existing.apps > 0;

  const selectTrack = (t) => {
    if (trackLocked) return;
    setTrack(t);
    if (t === 'a') {
      setForm((f) => ({ ...f, capacity: '' }));
    }
  };

  const toggleSkill = (skill) => {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(skill) ? f.skills.filter((s) => s !== skill) : [...f.skills, skill],
    }));
  };

  const toggleDept = (dept) => {
    if (isManager) return; // locked — managers only ever have their own department
    setDepts((d) => (d.includes(dept) ? d.filter((x) => x !== dept) : [...d, dept]));
  };

  const handleField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const triggerDocUpload = () => docInputRef.current && docInputRef.current.click();
  const handleDocUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setDocError('');
    setDocUploading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('documents', f));
      const data = await apiUpload(`/opportunities/${id}/documents`, formData);
      setDocuments(data.opportunity?.documents || []);
    } catch (err) {
      setDocError(err.message || 'Could not upload document(s). Please try again.');
    } finally {
      setDocUploading(false);
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };
  const removeDocument = async (docId) => {
    setDocError('');
    try {
      const data = await apiRequest(`/opportunities/${id}/documents/${docId}`, { method: 'DELETE' });
      setDocuments(data.opportunity?.documents || []);
    } catch (err) {
      setDocError(err.message || 'Could not remove this document. Please try again.');
    }
  };

  // Skills Required / Owning Department are only mandatory for Track B —
  // no skill barrier and no required department ownership for Track A by
  // design (mirrors models/Opportunity.js's now-conditional validators).
  const save = async (publish) => {
    const missingBasics = !form.title.trim() || !form.overview.trim() || !form.mode;
    const missingTrackB = track === 'b' && (form.skills.length === 0 || depts.length === 0);
    if (missingBasics || missingTrackB) {
      setFormError(
        track === 'b'
          ? 'Please complete Title, Overview, Mode, at least one Skill, and at least one Department before saving.'
          : 'Please complete Title, Overview, and Mode before saving.'
      );
      return;
    }
    setFormError('');
    setSaving(true);

    const payload = {
      ...form,
      title: form.title.trim(),
      overview: form.overview.trim(),
      track,
      depts,
      status: publish ? 'active' : 'draft',
    };

    try {
      if (isEditing) {
        await apiRequest(`/opportunities/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiRequest('/opportunities', { method: 'POST', body: JSON.stringify(payload) });
      }
      navigate('/opportunities');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
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

  const sidebar = (
    <>
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-wrap">
            <div className="logo-icon">🌳</div>
            <div className="logo-text">
              Sankalp<span>Taru</span>
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
    </>
  );

  if (isEditing && loadingExisting) {
    return (
      <div className="dash-page page-create-edit-opportunity">
        {sidebar}
        <div className="main">
          <div className="topbar">
            <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              ☰
            </button>
            <div className="topbar-title">Opportunities</div>
            <div className="topbar-right">
              <span className="topbar-role-chip">{shell.roleChip}</span>
              <ProfileMenu avatarInitial={shell.avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
            </div>
          </div>
          <div className="content">
            <p style={{ padding: '40px 0', textAlign: 'center', color: '#6b7280' }}>Loading opportunity…</p>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || forbidden) {
    return (
      <div className="dash-page page-create-edit-opportunity">
        {sidebar}
        <div className="main">
          <div className="topbar">
            <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              ☰
            </button>
            <div className="topbar-title">Opportunities</div>
            <div className="topbar-right">
              <span className="topbar-role-chip">{shell.roleChip}</span>
              <ProfileMenu avatarInitial={shell.avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
            </div>
          </div>
          <div className="content">
            <div className="restricted show">
              <div className="r-icon">🔒</div>
              <h3>{notFound ? 'Opportunity not found' : 'Not your department'}</h3>
              <p>
                {notFound
                  ? "This opportunity doesn't exist or was removed."
                  : `This opportunity isn't owned by ${meta.myDepartment || 'your department'}, so you can't edit it.`}
              </p>
              <button className="btn-ghost" style={{ marginTop: 18 }} onClick={() => navigate('/opportunities')}>
                Back to Opportunities
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-page page-create-edit-opportunity">
      {sidebar}

      <div className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div className="topbar-title">
            Opportunities
            <div className="breadcrumb">
              <a href="/opportunities" onClick={(e) => { e.preventDefault(); navigate('/opportunities'); }}>
                Opportunities
              </a>{' '}
              / {isEditing ? 'Edit Opportunity' : 'Create Opportunity'}
            </div>
          </div>
          <div className="topbar-right">
            <span className="topbar-role-chip">{shell.roleChip}</span>
            <ProfileMenu avatarInitial={shell.avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
          </div>
        </div>

        <div className="content">
          <div className="page-head">
            <div>
              <h1>{isEditing ? 'Edit Opportunity' : 'Create Opportunity'}</h1>
              <p>Set track, skills, mode, and owning department(s)</p>
            </div>
          </div>

          {loadError && <p className="form-error">{loadError}</p>}

          <div className="section-card">
            <h3>Track</h3>
            <div className="track-toggle">
              <div
                className={`track-option ${track === 'a' ? 'selected' : ''} ${trackLocked ? 'locked' : ''}`}
                onClick={() => selectTrack('a')}
              >
                <h4>🌱 Track A — Evergreen</h4>
                <p>No skill barrier · unlimited applications · auto-approved · instant certificate</p>
              </div>
              <div
                className={`track-option ${track === 'b' ? 'selected' : ''} ${trackLocked ? 'locked' : ''}`}
                onClick={() => selectTrack('b')}
              >
                <h4>🎯 Track B — Skilled</h4>
                <p>Portfolio required · manager approval · task assigned · certificate on approval</p>
              </div>
            </div>
            {trackLocked && (
              <div className="field-hint">Track cannot be changed once applications exist against this opportunity.</div>
            )}
          </div>

          <div className="section-card">
            <h3>Details</h3>
            <div className="field-group">
              <label className="field-label">
                Title <span className="field-required">*</span>
              </label>
              <input
                type="text"
                className="field-input"
                placeholder="e.g. Social Media Volunteer — Climate Campaigns"
                value={form.title}
                onChange={handleField('title')}
              />
            </div>
            <div className="field-group">
              <label className="field-label">
                Overview <span className="field-required">*</span>
              </label>
              <textarea
                className="field-input"
                placeholder="Describe what this opportunity is about..."
                value={form.overview}
                onChange={handleField('overview')}
              />
            </div>
            <div className="field-row">
              <div className="field-group">
                <label className="field-label">What You Will Do</label>
                <textarea
                  className="field-input short"
                  placeholder="One line per activity"
                  value={form.whatYouWillDo}
                  onChange={handleField('whatYouWillDo')}
                />
              </div>
              <div className="field-group">
                <label className="field-label">What You Will Learn</label>
                <textarea
                  className="field-input short"
                  placeholder="One line per learning outcome"
                  value={form.whatYouWillLearn}
                  onChange={handleField('whatYouWillLearn')}
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field-group">
                <label className="field-label">
                  Mode <span className="field-required">*</span>
                </label>
                <select className="field-input" value={form.mode} onChange={handleField('mode')} disabled={metaLoading}>
                  <option value="">{metaLoading ? 'Loading…' : 'Select mode'}</option>
                  {meta.modes.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Duration <span className="field-optional">(weeks)</span></label>
                <input
                  type="number"
                  className="field-input"
                  placeholder="e.g. 4"
                  min="1"
                  step="1"
                  value={form.duration}
                  onChange={handleField('duration')}
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field-group">
                <label className="field-label">Time Commitment <span className="field-optional">(hrs/week)</span></label>
                <input
                  type="number"
                  className="field-input"
                  placeholder="e.g. 4"
                  min="0"
                  step="0.5"
                  value={form.timeCommitment}
                  onChange={handleField('timeCommitment')}
                />
              </div>
              <div className="field-group">
                <label className="field-label">
                  Capacity <span className="field-optional">(optional — unlimited if blank)</span>
                </label>
                <input
                  type="number"
                  className="field-input"
                  placeholder={track === 'a' ? 'Unlimited (Track A)' : 'e.g. 5'}
                  min="1"
                  disabled={track === 'a'}
                  value={form.capacity}
                  onChange={handleField('capacity')}
                />
              </div>
            </div>
          </div>

          {/* Skills Required / Owning Department — Track B only. Track A
              ("no skill barrier") never needed either: there's nothing to
              skill-match, and evergreen work isn't necessarily owned by
              one department. */}
          {track === 'b' && (
            <>
              <div className="section-card">
                <h3>
                  Skills Required <span className="field-required">*</span>
                </h3>
                {metaLoading && <div className="field-hint">Loading skills…</div>}
                {/* Grouped by category (same categories/skills a volunteer picks
                    from at registration — Skill.jsx) rather than one flat list,
                    so it's easy to scan for a specific skill. Falls back to a
                    single ungrouped chip-select if an older backend only sends
                    the flat `skills` list. */}
                {meta.skillCategories && meta.skillCategories.length > 0 ? (
                  meta.skillCategories.map((cat) => (
                    <div key={cat.id} className="skill-group">
                      <div className="skill-group-title">{cat.title}</div>
                      <div className="chip-select">
                        {cat.skills.map((skill) => (
                          <div
                            key={skill}
                            className={`chip-option ${form.skills.includes(skill) ? 'selected' : ''}`}
                            onClick={() => toggleSkill(skill)}
                          >
                            {skill}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="chip-select">
                    {meta.skills.map((skill) => (
                      <div
                        key={skill}
                        className={`chip-option ${form.skills.includes(skill) ? 'selected' : ''}`}
                        onClick={() => toggleSkill(skill)}
                      >
                        {skill}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="section-card">
                <h3>
                  Owning Department(s) <span className="field-required">*</span>
                </h3>
                {isManager ? (
                  <>
                    <div className="chip-select">
                      <div className="chip-option selected locked">
                        🔒 {metaLoading ? 'Loading…' : meta.myDepartment || '…'}
                      </div>
                    </div>
                    <div className="field-hint">
                      Department Heads can only create or edit opportunities for their own department.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="chip-select">
                      {metaLoading && <div className="field-hint">Loading departments…</div>}
                      {meta.departments.map((dept) => (
                        <div
                          key={dept}
                          className={`chip-option ${depts.includes(dept) ? 'selected' : ''}`}
                          onClick={() => toggleDept(dept)}
                        >
                          {dept}
                        </div>
                      ))}
                    </div>
                    <div className="field-hint">
                      Every Track B opportunity must have at least one owning department. Department Heads must
                      include their own department.
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* Related Documents — Track B only. Uploads immediately, so this
              only works once the opportunity has an :id — a brand-new one
              needs saving at least once first (Save as Draft is enough). */}
          {track === 'b' && (
            <div className="section-card">
              <h3>Related Documents <span className="field-optional">(SRS, briefs, or other reference material)</span></h3>
              {!isEditing ? (
                <div className="field-hint">Save this opportunity first (Save as Draft works) — then come back here to attach documents.</div>
              ) : (
                <>
                  {documents.length > 0 && (
                    <div className="doc-list">
                      {documents.map((d) => (
                        <div className="doc-row" key={d.id}>
                          <span className="doc-icon">📄</span>
                          <a href={d.url} target="_blank" rel="noreferrer" className="doc-name">{d.fileName}</a>
                          <button type="button" className="doc-remove" onClick={() => removeDocument(d.id)} disabled={docUploading}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" className="btn-ghost" onClick={triggerDocUpload} disabled={docUploading}>
                    {docUploading ? 'Uploading…' : '📁 Upload Document(s)'}
                  </button>
                  <input
                    type="file"
                    ref={docInputRef}
                    style={{ display: 'none' }}
                    multiple
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*"
                    onChange={handleDocUpload}
                  />
                  {docError && <p className="form-error" style={{ marginTop: 10, marginBottom: 0 }}>{docError}</p>}
                </>
              )}
            </div>
          )}

          <div className="section-card">
            <h3>Certificate &amp; Portfolio</h3>
            <div className="cert-note">
              {track === 'a'
                ? 'Certificate generated automatically on submission.'
                : 'Certificate generated automatically on manager approval.'}
            </div>
            {track === 'b' && (
              <div className="toggle-locked" style={{ marginTop: 12 }}>
                🔒 Portfolio / relevant work required — locked on for Track B, cannot be disabled.
              </div>
            )}
          </div>

          {formError && <p className="form-error">{formError}</p>}

          <div className="form-actions">
            <button className="btn-ghost" disabled={saving} onClick={() => navigate('/opportunities')}>
              Cancel
            </button>
            <button className="btn-ghost" disabled={saving} onClick={() => save(false)}>
              {saving ? 'Saving…' : 'Save as Draft'}
            </button>
            <button className="btn-primary" disabled={saving} onClick={() => save(true)}>
              {saving ? 'Saving…' : 'Save & Publish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
