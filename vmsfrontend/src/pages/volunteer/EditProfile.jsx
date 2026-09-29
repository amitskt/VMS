import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPatch, apiPostForm } from './api';
import './EditProfile.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Real "Profile Settings" page for volunteers who have already onboarded.
 *
 * Dashboard.jsx's "Profile Settings" link used to route here via the
 * onboarding wizard (Profile.jsx -> Skill.jsx), which has no pre-fill and
 * always ends by navigating away — fine for a brand-new signup, wrong for
 * "let me go update my details". This page instead:
 *   - Pre-fills every field from GET /volunteer/profile on mount.
 *   - Combines every field from BOTH Profile.jsx (Step 2) and Skill.jsx
 *     (Step 3) on one page, since from a returning volunteer's point of
 *     view "my profile" is all one thing.
 *   - Saves via the same two endpoints those wizard steps already use
 *     (PATCH /volunteer/profile + PATCH /volunteer/skills) behind a single
 *     "Update Profile" button, and stays on the page afterwards instead of
 *     navigating away.
 *   - Adds resume upload/replace, wired to the new
 *     POST /volunteer/profile/resume endpoint. The resume uploads
 *     immediately on file selection (independent of the Update Profile button),
 *     since losing a freshly-picked resume because the volunteer forgot to
 *     hit Save elsewhere would be a bad surprise.
 *
 * Deliberately a NEW file rather than a rewrite of Profile.jsx/Skill.jsx —
 * those two remain the real first-run onboarding wizard (full-page/no-shell
 * layout, forced navigation). This page uses the normal dashboard shell
 * (VolunteerShell.css), like MyEngagement.jsx.
 *
 * Its own CSS file (EditProfile.css) intentionally does NOT import
 * Profile.css or Skill.css — those two define several identically-named
 * classes (.pill, .check-pill, .bottom-bar, ...) with different rule
 * bodies, so importing both here would create exactly the cascade
 * collision VolunteerShell.css's own file header warns about. Every rule
 * this page needs is instead re-declared, scoped under .page-edit-profile.
 */

const COMPETENCIES = [
  {
    id: 'tech', icon: '💻', bg: '#EBF5FF', title: 'Technology', subtitle: 'Dev, data, design systems',
    skills: ['Web Development', 'Data Analysis', 'Mobile App Development', 'UI/UX Design', 'Database Management', 'Cybersecurity'],
  },
  {
    id: 'comm', icon: '✍️', bg: '#FFF8E1', title: 'Communication & Writing', subtitle: 'Content, journalism, social',
    skills: ['Content Writing', 'Social Media Management', 'Copywriting', 'Public Speaking', 'Translation / Multilingual'],
  },
  {
    id: 'design', icon: '🎨', bg: '#F3E8FF', title: 'Design & Creative', subtitle: 'Graphics, video, photography',
    skills: ['Graphic Design', 'Video Editing', 'Photography', 'Motion Graphics / Animation', 'Illustration'],
  },
  {
    id: 'edu', icon: '📚', bg: '#ECFDF5', title: 'Education & Training', subtitle: 'Teaching, mentoring, facilitation',
    skills: ['School Teaching', 'Workshop Facilitation', 'Curriculum Design', 'Youth Mentoring'],
  },
  {
    id: 'field', icon: '🌿', bg: '#FFF3CD', title: 'Field & Environment', subtitle: 'Planting, surveys, ecology',
    skills: ['Tree Planting', 'Ecological Survey', 'Nursery Management', 'Environmental Monitoring'],
  },
  {
    id: 'mgmt', icon: '📋', bg: '#FEF3F2', title: 'Management & Operations', subtitle: 'Events, logistics, coordination',
    skills: ['Event Planning', 'Volunteer Coordination', 'Project Management', 'Logistics & Supply Chain'],
  },
  {
    id: 'fund', icon: '💰', bg: '#FFFBEB', title: 'Fundraising & Outreach', subtitle: 'Campaigns, CSR, partnerships',
    skills: ['Crowdfunding Campaigns', 'Grant Writing', 'Corporate Outreach', 'Community Mobilisation'],
  },
  {
    id: 'research', icon: '🔬', bg: '#E0F2FE', title: 'Research & Analysis', subtitle: 'Science, policy, reporting',
    skills: ['Scientific Research', 'Policy Analysis', 'Impact Assessment', 'Data Journalism'],
  },
];

const ENGAGEMENT_OPTIONS = [
  { id: 'student', icon: '🧑‍🎓', title: 'Student', desc: 'Currently studying' },
  { id: 'professional', icon: '💼', title: 'Working Professional', desc: 'Employed full/part-time' },
  { id: 'freelancer', icon: '🧩', title: 'Freelancer', desc: 'Self-employed / independent' },
  { id: 'homemaker', icon: '🏠', title: 'Homemaker', desc: 'Managing home & family' },
  { id: 'retired', icon: '🌇', title: 'Retired', desc: 'Retired from work' },
  { id: 'other', icon: '✨', title: 'Other', desc: 'None of the above' },
];

const AVAILABILITY_OPTIONS = [
  { id: 'weekdays', title: 'Weekdays', desc: 'Monday – Friday' },
  { id: 'weekends', title: 'Weekends', desc: 'Saturday – Sunday' },
  { id: 'holidays', title: 'National/Public Holidays', desc: '' },
  { id: 'flexible', title: 'Flexible', desc: 'Available whenever needed' },
];

const MODE_OPTIONS = [
  { id: 'remote', label: '🌐 Remote / Online' },
  { id: 'field', label: '🌳 In-Person Field' },
  { id: 'office', label: '🏢 In-Person Office' },
  { id: 'hybrid', label: '🔀 Hybrid (Both)' },
];

const REQUIRED_FIELDS = ['firstName', 'lastName', 'phone', 'ageRange', 'pincode', 'cityTown'];
const NOTE_MAX = 300;
const RESUME_ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function EditProfile() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // --- Profile.jsx fields ---
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');

  const [pincode, setPincode] = useState('');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [cityTown, setCityTown] = useState('');
  const [pincodeStatus, setPincodeStatus] = useState('idle'); // idle | loading | found | notfound | error
  const pincodeTouchedRef = useRef(false);

  const [engagement, setEngagement] = useState(null);

  const [photoPreview, setPhotoPreview] = useState(null);
  const photoInputRef = useRef(null);

  // --- Skill.jsx fields ---
  const [expanded, setExpanded] = useState({});
  const [selectedSkills, setSelectedSkills] = useState({});
  const [mode, setMode] = useState('remote');
  const [prefCity, setPrefCity] = useState('');
  const [languages, setLanguages] = useState('');
  const [portfolio, setPortfolio] = useState('');
  const [note, setNote] = useState('');

  // --- Shared availability ---
  const [availability, setAvailability] = useState({ weekdays: false, weekends: false, holidays: false, flexible: false });
  const [timeFrom, setTimeFrom] = useState('18:00');
  const [timeTo, setTimeTo] = useState('20:00');

  // --- Resume ---
  const [resumeUrl, setResumeUrl] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [resumeUploadedAt, setResumeUploadedAt] = useState('');
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeError, setResumeError] = useState('');
  const resumeInputRef = useRef(null);

  // --- Save state ---
  const [errors, setErrors] = useState({});
  const [shakeField, setShakeField] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const firstErrorRef = useRef(null);

  // --- Load existing profile ---
  useEffect(() => {
    setLoading(true);
    apiGet('/volunteer/profile')
      .then(({ user }) => {
        setFirstName(user.firstName || '');
        setLastName(user.lastName || '');
        setPhone(user.phone || '');
        setAgeRange(user.ageRange || '');
        setGender(user.gender || '');
        setBloodGroup(user.bloodGroup || '');

        setPincode(user.pincode || '');
        setState(user.state || '');
        setDistrict(user.district || '');
        setCityTown(user.cityTown || '');

        setEngagement(user.engagement || null);
        setPhotoPreview(user.photoUrl || null);

        const avail = user.availability || {};
        setAvailability({
          weekdays: !!avail.weekdays,
          weekends: !!avail.weekends,
          holidays: !!avail.holidays,
          flexible: !!avail.flexible,
        });
        setTimeFrom(avail.weekdaysTimeFrom || '18:00');
        setTimeTo(avail.weekdaysTimeTo || '20:00');

        setSelectedSkills(user.selectedSkills || {});
        setMode(user.mode || 'remote');
        setPrefCity(user.prefCity || '');
        setLanguages(user.languages || '');
        setPortfolio(user.portfolio || '');
        setNote(user.note || '');

        setResumeUrl(user.resumeUrl || '');
        setResumeFileName(user.resumeFileName || '');
        setResumeUploadedAt(user.resumeUploadedAt || '');
        setLoadError('');
      })
      .catch((err) => setLoadError(err.message || 'Could not load your profile.'))
      .finally(() => setLoading(false));
  }, []);

  // --- Pincode lookup (skips the very first render's value so the initial
  // load doesn't flash a "looking up" state for a pincode we already trust
  // from the database; any change the volunteer makes afterwards still
  // triggers a fresh lookup). ---
  useEffect(() => {
    if (!pincodeTouchedRef.current) {
      pincodeTouchedRef.current = true;
      return;
    }
    if (!/^\d{6}$/.test(pincode)) {
      setState('');
      setDistrict('');
      setPincodeStatus('idle');
      return;
    }

    let cancelled = false;
    setPincodeStatus('loading');

    fetch(`https://api.postalpincode.in/pincode/${pincode}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const result = Array.isArray(data) ? data[0] : null;
        if (result && result.Status === 'Success' && result.PostOffice && result.PostOffice.length) {
          const po = result.PostOffice[0];
          setState(po.State || '');
          setDistrict(po.District || '');
          setPincodeStatus('found');
        } else {
          setState('');
          setDistrict('');
          setPincodeStatus('notfound');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState('');
          setDistrict('');
          setPincodeStatus('error');
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pincode]);

  // --- Photo ---
  const triggerPhotoUpload = () => photoInputRef.current && photoInputRef.current.click();
  const handlePhotoChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  // --- Resume (uploads immediately, independent of Update Profile) ---
  const triggerResumeUpload = () => resumeInputRef.current && resumeInputRef.current.click();
  const handleResumeChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setResumeError('');
    setResumeUploading(true);
    try {
      const formData = new FormData();
      formData.append('resume', file);
      const data = await apiPostForm('/volunteer/profile/resume', formData);
      setResumeUrl(data.user?.resumeUrl || '');
      setResumeFileName(data.user?.resumeFileName || file.name);
      setResumeUploadedAt(data.user?.resumeUploadedAt || new Date().toISOString());
    } catch (err) {
      setResumeError(err.message || 'Could not upload your resume. Please try again.');
    } finally {
      setResumeUploading(false);
      if (resumeInputRef.current) resumeInputRef.current.value = '';
    }
  };

  // --- Availability ---
  const toggleAvailability = (id) => {
    setAvailability((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // --- Skills ---
  const toggleExpanded = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleSkill = (catId, skill, e) => {
    e.stopPropagation();
    setSelectedSkills((prev) => {
      const current = prev[catId] || [];
      const next = current.includes(skill) ? current.filter((s) => s !== skill) : [...current, skill];
      return { ...prev, [catId]: next };
    });
  };
  const totalSkills = useMemo(
    () => Object.values(selectedSkills).reduce((sum, arr) => sum + (arr ? arr.length : 0), 0),
    [selectedSkills]
  );
  const noteState = note.length >= NOTE_MAX ? 'over' : note.length > 280 ? 'warn' : '';

  const fieldClass = (id) => `${errors[id] ? 'error' : ''} ${shakeField === id ? 'shake' : ''}`.trim();
  const setRefIfError = (id) => (el) => { if (errors[id] && !firstErrorRef.current) firstErrorRef.current = el; };

  // --- Save (both PATCH endpoints, single button) ---
  const handleUpdateProfile = async () => {
    firstErrorRef.current = null;
    const nextErrors = {};
    const values = { firstName, lastName, phone, ageRange, pincode, cityTown };
    REQUIRED_FIELDS.forEach((id) => {
      if (!String(values[id] || '').trim()) nextErrors[id] = true;
    });
    setErrors(nextErrors);
    setSaved(false);

    const firstBad = REQUIRED_FIELDS.find((id) => nextErrors[id]);
    if (firstBad) {
      setShakeField(firstBad);
      setTimeout(() => setShakeField(null), 300);
      setTimeout(() => {
        if (firstErrorRef.current) firstErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 0);
      return;
    }

    const profileData = {
      firstName, lastName, phone, ageRange, gender, bloodGroup,
      pincode, state, district, cityTown, engagement,
      availability, timeFrom, timeTo, photoPreview,
    };
    const skillsData = {
      selectedSkills, totalSkills, availability, timeFrom, timeTo,
      mode, prefCity, langs: languages, portfolio, note,
    };

    setSaveError('');
    setSaving(true);
    try {
      await Promise.all([
        apiPatch('/volunteer/profile', profileData),
        apiPatch('/volunteer/skills', skillsData),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(err.message || 'Could not update your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="volunteer-shell page-edit-profile">
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
            <a className="nav-item active"><span className="icon">⚙️</span>Profile Settings</a>
          </div>
        </nav>
      </aside>
      <div className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
          <div className="topbar-title">⚙️ Profile Settings</div>
        <div className="topbar-right">
          <ProfileMenu avatarClassName="avatar" profilePath="/my-profile" />
        </div>
        </div>

        <div className="content">
          {loading ? (
            <div className="empty-state"><div className="e-icon">⚙️</div><p>Loading your profile…</p></div>
          ) : loadError ? (
            <p className="form-error">{loadError}</p>
          ) : (
            <>
              <div className="page-intro">
                <h1>Edit Your Profile</h1>
                <p>Keep your details, skills, and resume up to date so coordinators can match you with the right opportunities.</p>
              </div>

              {/* PHOTO + BASIC INFO */}
              <div className="form-card">
                <h3>📸 Profile Photo &amp; Basic Info</h3>
                <div className="photo-upload-section">
                  <div className="photo-preview" onClick={triggerPhotoUpload}>
                    {photoPreview ? <img src={photoPreview} alt="Profile preview" /> : '🌿'}
                    <div className="edit-overlay">✏️ Edit</div>
                  </div>
                  <div className="photo-upload-info">
                    <h4>Upload your photo</h4>
                    <p>A clear face photo helps coordinators recognise you at field events. JPG or PNG, max 5MB.</p>
                    <button type="button" className="upload-btn" onClick={triggerPhotoUpload}>📁 Choose Photo</button>
                    <input type="file" ref={photoInputRef} style={{ display: 'none' }} accept="image/*" onChange={handlePhotoChange} />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field-group">
                    <label>First Name <span className="required">*</span></label>
                    <input
                      ref={setRefIfError('firstName')}
                      type="text"
                      placeholder="e.g. Priya"
                      value={firstName}
                      className={fieldClass('firstName')}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label>Last Name <span className="required">*</span></label>
                    <input
                      ref={setRefIfError('lastName')}
                      type="text"
                      placeholder="e.g. Sharma"
                      value={lastName}
                      className={fieldClass('lastName')}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                  <div className="field-group span-2">
                    <label>Phone Number <span className="required">*</span></label>
                    <input
                      ref={setRefIfError('phone')}
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={phone}
                      className={fieldClass('phone')}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                    <span className="field-hint">Used only for event coordination. Never shared publicly.</span>
                  </div>
                </div>
              </div>

              {/* ABOUT YOU + LOCATION */}
              <div className="form-card">
                <h3>📊 About You</h3>
                <div className="form-grid cols-3">
                  <div className="field-group">
                    <label>Age Range <span className="required">*</span></label>
                    <select
                      ref={setRefIfError('ageRange')}
                      value={ageRange}
                      className={fieldClass('ageRange')}
                      onChange={(e) => setAgeRange(e.target.value)}
                    >
                      <option value="">Select age range</option>
                      <option value="under18">Below 18</option>
                      <option value="18-24">18 – 24</option>
                      <option value="25-34">25 – 34</option>
                      <option value="35-44">35 – 44</option>
                      <option value="45-60">45 – 60</option>
                      <option value="60+">60 and above</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <label>Gender <span className="optional">(optional)</span></label>
                    <select value={gender} onChange={(e) => setGender(e.target.value)}>
                      <option value="">Prefer not to say</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="non-binary">Non-binary</option>
                      <option value="other">Prefer not to say</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <label>Blood Group <span className="optional">(optional)</span></label>
                    <select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)}>
                      <option value="">Select blood group</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                      <option value="unknown">I don't know</option>
                    </select>
                    <span className="field-hint">Helps in medical emergencies during field events.</span>
                  </div>
                </div>

                <div className="form-grid" style={{ marginTop: 20 }}>
                  <div className="field-group">
                    <label>Pincode <span className="required">*</span></label>
                    <input
                      ref={setRefIfError('pincode')}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="e.g. 560001"
                      value={pincode}
                      className={fieldClass('pincode')}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                    {pincodeStatus === 'loading' && <span className="field-loading">Looking up pincode…</span>}
                    {pincodeStatus === 'notfound' && <span className="field-error visible">Pincode not found. Check and try again.</span>}
                    {pincodeStatus === 'error' && <span className="field-error visible">Couldn't verify pincode right now.</span>}
                    {pincodeStatus === 'idle' && <span className="field-hint">Enter your 6-digit pincode to auto-fill state &amp; district.</span>}
                  </div>
                  <div className="field-group">
                    <label>State</label>
                    <input type="text" value={state} placeholder="Auto-filled from pincode" disabled />
                  </div>
                  <div className="field-group span-2">
                    <label>District</label>
                    <input type="text" value={district} placeholder="Auto-filled from pincode" disabled />
                  </div>
                  <div className="field-group span-2">
                    <label>City / Town / Village <span className="required">*</span></label>
                    <input
                      ref={setRefIfError('cityTown')}
                      type="text"
                      placeholder="e.g. Indiranagar, Wagholi, Sohna…"
                      value={cityTown}
                      className={fieldClass('cityTown')}
                      onChange={(e) => setCityTown(e.target.value)}
                    />
                    <span className="field-hint">Enter the exact locality — this helps us find volunteering opportunities near you.</span>
                  </div>
                </div>
              </div>

              {/* ENGAGEMENT STATUS */}
              <div className="form-card">
                <h3>🤝 Engagement Status</h3>
                <div className="engagement-cards">
                  {ENGAGEMENT_OPTIONS.map((opt) => (
                    <div
                      key={opt.id}
                      className={`eng-card ${engagement === opt.id ? 'selected' : ''}`}
                      onClick={() => setEngagement(opt.id)}
                    >
                      <div className="eng-icon">{opt.icon}</div>
                      <h4>{opt.title}</h4>
                      <p>{opt.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* RESUME */}
              <div className="form-card">
                <h3>📄 Resume</h3>
                <p className="card-subtitle">Upload your resume so coordinators can review your background. PDF or Word, max 15MB.</p>
                <div className="resume-box">
                  {resumeFileName ? (
                    <div className="resume-current">
                      <div className="resume-icon">📄</div>
                      <div className="resume-info">
                        <h5>{resumeFileName}</h5>
                        <p>{resumeUploadedAt ? `Uploaded ${formatDate(resumeUploadedAt)}` : 'Uploaded'}</p>
                      </div>
                      <div className="resume-actions">
                        {resumeUrl && <a href={resumeUrl} target="_blank" rel="noreferrer" className="btn-ghost">View</a>}
                        <button type="button" className="btn-ghost" onClick={triggerResumeUpload} disabled={resumeUploading}>
                          {resumeUploading ? 'Uploading…' : 'Replace'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="resume-empty">
                      <div className="resume-icon">📄</div>
                      <div className="resume-info">
                        <h5>No resume uploaded yet</h5>
                        <p>Add one to strengthen your applications.</p>
                      </div>
                      <button type="button" className="btn-primary" onClick={triggerResumeUpload} disabled={resumeUploading}>
                        {resumeUploading ? 'Uploading…' : '📁 Upload Resume'}
                      </button>
                    </div>
                  )}
                  <input
                    type="file"
                    ref={resumeInputRef}
                    style={{ display: 'none' }}
                    accept={RESUME_ACCEPT}
                    onChange={handleResumeChange}
                  />
                </div>
                {resumeError && <p className="form-error" style={{ marginTop: 10, marginBottom: 0 }}>{resumeError}</p>}
              </div>

              {/* SKILLS */}
              <div className="form-card">
                <h3>🎯 What are your superpowers?</h3>
                <p className="card-subtitle">Select skills you have. We use these to match you with volunteering opportunities.</p>
                <div className="competency-grid">
                  {COMPETENCIES.map((cat) => {
                    const catSelected = selectedSkills[cat.id] || [];
                    const isExpanded = !!expanded[cat.id];
                    return (
                      <div
                        key={cat.id}
                        className={`comp-card ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => toggleExpanded(cat.id)}
                      >
                        <div className="comp-header">
                          <div className="comp-icon" style={{ background: cat.bg }}>{cat.icon}</div>
                          <div className="comp-title">
                            <h4>{cat.title}</h4>
                            <p>{cat.subtitle}</p>
                          </div>
                          <div className={`comp-selected-count ${catSelected.length > 0 ? 'visible' : ''}`}>{catSelected.length}</div>
                          <div className="comp-arrow">›</div>
                        </div>
                        <div className="comp-body">
                          <div className="skill-list">
                            {cat.skills.map((skill) => {
                              const checked = catSelected.includes(skill);
                              return (
                                <div
                                  key={skill}
                                  className={`skill-item ${checked ? 'checked' : ''}`}
                                  onClick={(e) => toggleSkill(cat.id, skill, e)}
                                >
                                  <div className="skill-cb">{checked ? '✓' : ''}</div>
                                  <span className="skill-name">{skill}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="card-subtitle" style={{ marginTop: 12, marginBottom: 0 }}>
                  <strong>{totalSkills}</strong> skill{totalSkills !== 1 ? 's' : ''} selected across all categories
                </p>
              </div>

              {/* AVAILABILITY */}
              <div className="form-card">
                <h3>🗓️ Availability</h3>
                <p className="card-subtitle">When are you available to volunteer?</p>
                <div className="check-pill-group">
                  {AVAILABILITY_OPTIONS.map((opt) => (
                    <div key={opt.id}>
                      <div
                        className={`check-pill ${availability[opt.id] ? 'checked' : ''}`}
                        onClick={() => toggleAvailability(opt.id)}
                      >
                        <div className="box">{availability[opt.id] ? '✓' : ''}</div>
                        <div className="check-pill-text">
                          <h5>{opt.title}</h5>
                          {opt.desc && <p>{opt.desc}</p>}
                        </div>
                      </div>
                      {opt.id === 'weekdays' && availability.weekdays && (
                        <div className="sub-question">
                          <label>Available Time</label>
                          <div className="time-row">
                            <div className="time-field">
                              <label>From</label>
                              <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
                            </div>
                            <div className="time-field">
                              <label>To</label>
                              <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* PREFERRED MODE */}
              <div className="form-card">
                <h3>🏠 Preferred Mode</h3>
                <p className="card-subtitle">How would you like to engage?</p>
                <div className="pill-group">
                  {MODE_OPTIONS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`pill ${mode === m.id ? 'selected' : ''}`}
                      onClick={() => setMode(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* OPTIONAL DETAILS */}
              <div className="form-card">
                <h3>📝 Optional Details</h3>
                <p className="card-subtitle">These help us refine your matches even further.</p>
                <div className="form-grid" style={{ marginBottom: 16 }}>
                  <div className="field-group">
                    <label>Preferred City</label>
                    <input type="text" placeholder="e.g. Bengaluru" value={prefCity} onChange={(e) => setPrefCity(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label>Languages</label>
                    <input type="text" placeholder="e.g. English, Hindi, Kannada" value={languages} onChange={(e) => setLanguages(e.target.value)} />
                  </div>
                </div>
                <div className="field-group" style={{ marginBottom: 16 }}>
                  <label>Portfolio / LinkedIn URL <span className="optional">(optional)</span></label>
                  <input type="url" placeholder="https://linkedin.com/in/yourname" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} />
                </div>
                <div className="field-group">
                  <label>Anything else you'd like us to know? <span className="optional">(optional)</span></label>
                  <textarea
                    rows={3}
                    maxLength={NOTE_MAX}
                    placeholder="e.g. I'm passionate about urban forestry and happy to travel within 50km of Bengaluru…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className={`char-counter ${noteState}`}>{note.length} / {NOTE_MAX}</div>
                </div>
              </div>

              {/* SAVE BAR */}
              <div className="bottom-bar">
                <div className="bottom-left">
                  {saveError ? (
                    <span className="save-error-text">⚠ {saveError}</span>
                  ) : saved ? (
                    <span className="save-success-text">✓ Profile updated successfully</span>
                  ) : (
                    <>Fields marked <strong>*</strong> are required</>
                  )}
                </div>
                <button
                  type="button"
                  className={`btn-primary ${saving ? 'saving' : ''}`}
                  onClick={handleUpdateProfile}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : saved ? '✓ Updated!' : 'Update Profile'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
