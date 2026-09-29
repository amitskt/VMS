import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPatch } from './api';
import './Skill.css';

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

const SAMPLE_OPPS = [
  { icon: '📸', title: 'Social Media Volunteer', pct: 94 },
  { icon: '✍️', title: 'Blog Content Writer', pct: 88 },
  { icon: '🌿', title: 'Tree Planting Diary', pct: 82 },
  { icon: '💻', title: 'Website Contributor', pct: 76 },
  { icon: '🎨', title: 'Poster Design Campaign', pct: 71 },
];

const NOTE_MAX = 300;

export default function Skills({ onContinue = () => {}, onSkip = () => {} }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState({});
  const [selectedSkills, setSelectedSkills] = useState({});

  const [availability, setAvailability] = useState({
    weekdays: false, weekends: false, holidays: false, flexible: false,
  });
  
  const [timeFrom, setTimeFrom] = useState('18:00');
  const [timeTo, setTimeTo] = useState('20:00');

  const [mode, setMode] = useState('remote');

  const [prefCity, setPrefCity] = useState('');
  const [langs, setLangs] = useState('');
  const [portfolio, setPortfolio] = useState('');
  const [note, setNote] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const toggleExpanded = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSkill = (catId, skill, e) => {
    e.stopPropagation();
    setSelectedSkills((prev) => {
      const current = prev[catId] || [];
      const next = current.includes(skill)
        ? current.filter((s) => s !== skill)
        : [...current, skill];
      return { ...prev, [catId]: next };
    });
  };

  
  const toggleAvailability = (id) => {
    setAvailability((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const totalSkills = useMemo(
    () => Object.values(selectedSkills).reduce((sum, arr) => sum + arr.length, 0),
    [selectedSkills]
  );

  const matchedOpps = useMemo(() => {
    const count = Math.min(SAMPLE_OPPS.length, Math.max(0, Math.floor(totalSkills * 1.4)));
    return SAMPLE_OPPS.slice(0, count);
  }, [totalSkills]);

  const noteState = note.length >= NOTE_MAX ? 'over' : note.length > 280 ? 'warn' : '';

  // "Skip for now" used to be wired straight to the onSkip prop, which
  // defaults to a no-op — since App.jsx renders <Skill /> with no props,
  // clicking it did literally nothing (no navigation, no way off the
  // page). Skills are optional (Track A never needed them, and a
  // volunteer can always add them later from Profile Settings /
  // EditProfile.jsx), so this should behave like Profile.jsx's own Skip:
  // move on without saving, not silently do nothing.
  const handleSkip = () => {
    onSkip();
    navigate('/dashboard');
  };

  const handleFinish = async () => {
    const payload = {
      selectedSkills, totalSkills, availability,
      timeFrom, timeTo, mode, prefCity, langs, portfolio, note,
    };

    setSaveError('');
    setSaving(true);
    try {
      const data = await apiPatch('/volunteer/skills', payload);
      onContinue(data.user || payload);
      navigate('/dashboard');
    } catch (err) {
      setSaveError(err.message || 'Could not save your skills & interests. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="skills-app">
      <header className="progress-header">
        <a href="#profile" className="logo">
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
            <div className="step-circle done">✓</div>
            <span className="step-label done">Profile</span>
          </div>
          <div className="step-connector done"></div>
          <div className="step-item">
            <div className="step-circle active">3</div>
            <span className="step-label active">Skills & Interests</span>
          </div>
        </div>
        <span className="progress-percent">Step 3 of 3</span>
      </header>

      <div className="page-body">
        {/* LEFT MATCH PREVIEW */}
        <aside className="left-col">
          <div className="match-preview">
            <h3>🎯 Live Match Preview</h3>
            <p className="subtitle">Updates as you select skills</p>
            <div className="match-count">
              <div className="num">{matchedOpps.length}</div>
              <div className="label">opportunities matched</div>
            </div>
            <div>
              {matchedOpps.length === 0 ? (
                <p className="match-empty">Select skills to see matches</p>
              ) : (
                matchedOpps.map((o) => (
                  <div className="match-opp" key={o.title}>
                    <div className="opp-icon">{o.icon}</div>
                    <div className="opp-info">
                      <h5>{o.title}</h5>
                      <p>Remote · Ongoing</p>
                    </div>
                    <span className="match-pct">{o.pct}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* RIGHT CONTENT */}
        <div className="right-col">
          <div className="page-header">
            <span className="tag">Step 3 of 3 — Skills & Interests</span>
            <h1>What are your superpowers?</h1>
            <p>Select skills you have. We'll use these to match you with volunteering opportunities that fit you best.</p>
          </div>

          {/* COMPETENCY GRID */}
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
                    <div className={`comp-selected-count ${catSelected.length > 0 ? 'visible' : ''}`}>
                      {catSelected.length}
                    </div>
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

          {/* AVAILABILITY */}
          <div className="section-card">
            <h3>🗓️ Availability</h3>
            <p className="section-sub">When are you available to volunteer?</p>

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
          <div className="section-card">
            <h3>🏠 Preferred Mode</h3>
            <p className="section-sub">How would you like to engage?</p>
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
          <div className="section-card">
            <h3>📝 Optional Details</h3>
            <p className="section-sub">These help us refine your matches even further.</p>

            <div className="form-row" style={{ marginBottom: 16 }}>
              <div>
                <label>Preferred City</label>
                <input
                  type="text"
                  placeholder="e.g. Bengaluru"
                  value={prefCity}
                  onChange={(e) => setPrefCity(e.target.value)}
                />
              </div>
              <div>
                <label>Languages</label>
                <input
                  type="text"
                  placeholder="e.g. English, Hindi, Kannada"
                  value={langs}
                  onChange={(e) => setLangs(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label>Portfolio / LinkedIn URL <span className="optional-tag">(optional)</span></label>
              <input
                type="url"
                placeholder="https://linkedin.com/in/yourname"
                value={portfolio}
                onChange={(e) => setPortfolio(e.target.value)}
              />
            </div>

            <div>
              <label>Anything else you'd like us to know? <span className="optional-tag">(optional)</span></label>
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
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div className="bottom-bar">
        <div className="bottom-left">
          {saveError ? (
            <span style={{ color: 'var(--error, #ef4444)' }}>⚠ {saveError}</span>
          ) : (
            <><strong>{totalSkills} skill{totalSkills !== 1 ? 's' : ''}</strong> selected across all categories</>
          )}
        </div>
        <div className="bottom-btns">
          <button type="button" className="btn-skip" onClick={handleSkip}>Skip for now</button>
          <button
            type="button"
            className={`btn-primary ${saving ? 'saving' : ''}`}
            onClick={handleFinish}
            disabled={saving}
          >
            {saving ? '✓ Saving profile…' : <>Show Matching Opportunities →</>}
          </button>
        </div>
      </div>
    </div>
  );
}
