
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPatch, apiPostForm } from './api';
import './Profile.css';

const RESUME_ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function formatResumeDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Engagement options — original card set plus the statuses from the reference dropdown
const ENGAGEMENT_GROUPS = [
  {
    label: 'What best describes you',
    options: [
      { id: 'student', icon: '🧑‍🎓', title: 'Student', desc: 'Currently studying' },
      { id: 'professional', icon: '💼', title: 'Working Professional', desc: 'Employed full/part-time' },
      { id: 'freelancer', icon: '🧩', title: 'Freelancer', desc: 'Self-employed / independent' },
      { id: 'homemaker', icon: '🏠', title: 'Homemaker', desc: 'Managing home & family' },
      { id: 'retired', icon: '🌇', title: 'Retired', desc: 'Retired from work' },
      { id: 'other', icon: '✨', title: 'Other', desc: 'None of the above' },
    ],
  },
];

const AVAILABILITY_OPTIONS = [
  { id: 'weekdays', title: 'Weekdays', desc: 'Monday – Friday' },
  { id: 'weekends', title: 'Weekends', desc: 'Saturday – Sunday' },
  { id: 'holidays', title: 'National/Public Holidays', desc: '' },
  { id: 'flexible', title: 'Flexible', desc: 'Available whenever needed' },
];

const REQUIRED_FIELDS = ['firstName', 'lastName', 'phone', 'ageRange', 'pincode', 'cityTown'];

export default function Profile({ onContinue = () => { }, onSkip = () => { } }) {
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');

  // Location via pincode
  const [pincode, setPincode] = useState('');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [cityTown, setCityTown] = useState('');
  const [pincodeStatus, setPincodeStatus] = useState('idle'); // idle | loading | found | notfound | error

  const [engagement, setEngagement] = useState(null);

  // Availability
  const [availability, setAvailability] = useState({
    weekdays: false,
    weekends: false,
    holidays: false,
    flexible: false,
  });
  const [afterOfficeHours, setAfterOfficeHours] = useState(null); // 'yes' | 'no' | null
  const [timeFrom, setTimeFrom] = useState('18:00');
  const [timeTo, setTimeTo] = useState('20:00');

  const [photoPreview, setPhotoPreview] = useState(null);
  const photoInputRef = useRef(null);

  // Resume — optional at this step. Uploads immediately on file selection
  // (same POST /volunteer/profile/resume endpoint EditProfile.jsx's
  // Profile Settings page uses), independent of the Continue/Skip buttons
  // below, so a volunteer can add it now or skip it and add it later from
  // Profile Settings without losing anything either way.
  const [resumeUrl, setResumeUrl] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [resumeUploadedAt, setResumeUploadedAt] = useState('');
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeError, setResumeError] = useState('');
  const resumeInputRef = useRef(null);

  const [errors, setErrors] = useState({});
  const [shakeField, setShakeField] = useState(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const firstErrorRef = useRef(null);

  // --- Pincode lookup ---
  useEffect(() => {
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
  }, [pincode]);

  // Best-effort resume prefill — covers a volunteer who somehow lands back
  // on this onboarding step after already adding a resume elsewhere.
  // Silent on failure: this step never pre-filled anything before, so a
  // failed lookup just leaves the resume section in its normal empty state.
  useEffect(() => {
    apiGet('/volunteer/profile')
      .then(({ user }) => {
        setResumeUrl(user.resumeUrl || '');
        setResumeFileName(user.resumeFileName || '');
        setResumeUploadedAt(user.resumeUploadedAt || '');
      })
      .catch(() => {});
  }, []);

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

  const showUnder18Warning = ageRange === 'under15' || ageRange === '15-17';

  // --- Photo upload ---
  const triggerPhotoUpload = () => photoInputRef.current && photoInputRef.current.click();
  const handlePhotoChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSkip = () => {
    onSkip();
    navigate('/set-skills');
  };

  // --- Availability handlers ---
  const toggleAvailability = (id) => {
    setAvailability((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (id === 'weekdays' && !next.weekdays) {
        setAfterOfficeHours(null);
      }
      return next;
    });
  };

  // --- Completion meter ---
  const completionPct = useMemo(() => {
    let filled = 0;
    const total = 7;
    if (firstName.trim()) filled++;
    if (lastName.trim()) filled++;
    if (phone.trim()) filled++;
    if (ageRange) filled++;
    if (pincode.trim() && cityTown.trim()) filled++;
    if (photoPreview) filled++;
    if (engagement) filled++;
    return Math.round((filled / total) * 100);
  }, [firstName, lastName, phone, ageRange, pincode, cityTown, photoPreview, engagement]);

  // --- Validation & submit ---
  const validateAndContinue = async () => {
    const nextErrors = {};
    const values = { firstName, lastName, phone, ageRange, pincode, cityTown };
    REQUIRED_FIELDS.forEach((id) => {
      if (!String(values[id] || '').trim()) nextErrors[id] = true;
    });
    setErrors(nextErrors);

    const firstBad = REQUIRED_FIELDS.find((id) => nextErrors[id]);
    if (firstBad) {
      setShakeField(firstBad);
      setTimeout(() => setShakeField(null), 300);
      if (firstErrorRef.current) {
        firstErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    const profileData = {
      firstName, lastName, phone, ageRange, gender, bloodGroup,
      pincode, state, district, cityTown,
      engagement, availability, afterOfficeHours,
      timeFrom, timeTo, photoPreview,
    };

    setSubmitError('');
    setSubmitting(true);
    try {
      const data = await apiPatch('/volunteer/profile', profileData);
      setSaved(true);
      onContinue(data.user || profileData);
      setTimeout(() => {
        navigate('/set-skills', { state: data.user || profileData });
      }, 800);
    } catch (err) {
      setSubmitError(err.message || 'Could not save your profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = (id) => `${errors[id] ? 'error' : ''} ${shakeField === id ? 'shake' : ''}`.trim();
  const setRefIfError = (id) => (el) => { if (errors[id] && !firstErrorRef.current) firstErrorRef.current = el; };

  return (
    <div className="profile-app">
      {/* PROGRESS HEADER */}
      <header className="progress-header">
        <a href="#account" className="logo">
          <div className="logo-lockup">
          <span className="logo-word">STart</span>
          <span className="logo-sub">by SankalpTaru</span>
        </div>
        </a>
        <div className="progress-steps">
          <div className="step-item">
            <div className="step-circle done">✓</div>
            <span className="step-label done">Account</span>
          </div>
          <div className="step-connector done"></div>
          <div className="step-item">
            <div className="step-circle active">2</div>
            <span className="step-label active">Your Profile</span>
          </div>
          <div className="step-connector"></div>
          <div className="step-item">
            <div className="step-circle pending">3</div>
            <span className="step-label pending">Skills & Interests</span>
          </div>
        </div>
        <span className="progress-percent">Step 2 of 3</span>
      </header>

      <div className="main-container">
        {/* LEFT PANEL */}
        <aside className="left-panel">
          <div className="steps-preview">
            <h3>Onboarding Steps</h3>

            <div className="preview-step">
              <div className="ps-icon done">🔐</div>
              <div className="ps-info">
                <h4>Create Account</h4>
                <p>Email & password set up</p>
                <span className="ps-badge done-badge">✓ Complete</span>
              </div>
            </div>

            <div className="preview-step">
              <div className="ps-icon active">👤</div>
              <div className="ps-info">
                <h4>Your Profile</h4>
                <p>Basic info & contact details</p>
                <span className="ps-badge active-badge">▶ In Progress</span>
              </div>
            </div>

            <div className="preview-step">
              <div className="ps-icon pending">🎯</div>
              <div className="ps-info">
                <h4>Skills & Interests</h4>
                <p>Match with opportunities</p>
                <span className="ps-badge pending-badge">Upcoming</span>
              </div>
            </div>
          </div>

          <div className="tip-card">
            <h4>🌱 Why complete your profile?</h4>
            <p>Volunteers with complete profiles get matched to 3x more opportunities and have a higher chance of selection.</p>
          </div>
        </aside>

        {/* RIGHT FORM */}
        <div className="form-panel">
          <div className="form-header">
            <span className="tag">Step 2 of 3 — Profile Setup</span>
            <h1>Tell us about yourself</h1>
            <p>This helps us personalise your volunteering experience and connect you with the right opportunities.</p>
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
                <input
                  type="file"
                  ref={photoInputRef}
                  style={{ display: 'none' }}
                  accept="image/*"
                  onChange={handlePhotoChange}
                />
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

          {/* RESUME (OPTIONAL) */}
          <div className="form-card">
            <h3>📄 Resume <span className="optional">(optional)</span></h3>
            <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>
              Add it now, or skip this and upload it anytime later from Profile Settings.
            </p>
            <div className="resume-box">
              {resumeFileName ? (
                <div className="resume-current">
                  <div className="resume-icon">📄</div>
                  <div className="resume-info">
                    <h5>{resumeFileName}</h5>
                    <p>{resumeUploadedAt ? `Uploaded ${formatResumeDate(resumeUploadedAt)}` : 'Uploaded'}</p>
                  </div>
                  <div className="resume-actions">
                    {resumeUrl && <a href={resumeUrl} target="_blank" rel="noreferrer" className="upload-btn">View</a>}
                    <button type="button" className="upload-btn" onClick={triggerResumeUpload} disabled={resumeUploading}>
                      {resumeUploading ? 'Uploading…' : 'Replace'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="resume-empty">
                  <div className="resume-icon">📄</div>
                  <div className="resume-info">
                    <h5>No resume added yet</h5>
                    <p>PDF or Word, max 15MB.</p>
                  </div>
                  <button type="button" className="upload-btn" onClick={triggerResumeUpload} disabled={resumeUploading}>
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
            {resumeError && <span className="field-error visible">{resumeError}</span>}
          </div>

          {/* DEMOGRAPHICS + LOCATION */}
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

            {showUnder18Warning && (
              <div className="warning-banner visible">
                <span className="icon">⚠️</span>
                <p>
                  <strong>Parental consent required.</strong> Volunteers under 18 need a signed parental
                  consent form before participating in field activities. We'll send the form to your
                  registered email after profile setup. You can still explore and express interest in opportunities.
                </p>
              </div>
            )}

            {/* PINCODE-FIRST LOCATION */}
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
                {pincodeStatus === 'idle' && <span className="field-hint">Enter your 6-digit pincode to auto-fill state & district.</span>}
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

            {ENGAGEMENT_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="eng-group-label">{group.label}</div>
                <div className="engagement-cards">
                  {group.options.map((opt) => (
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
            ))}
          </div>
          
          {/* COMPLETION NUDGE */}
          <div className="completion-hint">
            <div className="completion-bar-wrap">
              <p>Profile completion</p>
              <div className="completion-bar">
                <div className="completion-fill" style={{ width: `${completionPct}%` }}></div>
              </div>
            </div>
            <div className="completion-pct">{completionPct}%</div>
          </div>
        </div>
      </div>
      
      {/* BOTTOM BAR */}
      <div className="bottom-bar">
        <span className="bottom-bar-left">
          {submitError ? (
            <span style={{ color: 'var(--error, #ef4444)' }}>⚠ {submitError}</span>
          ) : (
            <>Fields marked <span>*</span> are required to continue</>
          )}
        </span>
        <div className="bottom-btns">
          <button type="button" className="btn-skip" onClick={handleSkip}>Skip for now</button>
          <button
            type="button"
            className={`btn-continue ${saved ? 'saved' : ''}`}
            onClick={validateAndContinue}
            disabled={submitting}
          >
            {saved ? '✓ Saved! Loading…' : submitting ? 'Saving…' : <>Continue to Skills <span>→</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}
