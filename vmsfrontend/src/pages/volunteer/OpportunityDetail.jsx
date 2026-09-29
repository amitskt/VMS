import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiPost, apiDelete } from './api';
import './OpportunityDetail.css';

/**
 * Converted from 06-opportunity-detail.html, wired to the real backend
 * (controllers/volunteerOpportunityController.js getOpportunityDetail).
 *
 * Adapted rather than copied 1:1 in a couple of places:
 * - The mockup let you tab-switch between a "Track A" and "Track B" view
 *   of what was presented as the same role. In this app's real data model
 *   an Opportunity is only ever ONE track (opportunityController.js), so
 *   there's no second track to switch to — this page shows the one real
 *   opportunity that was clicked, framed for whichever track it actually is.
 * - The mockup's "Requirements" list (18+, own smartphone, 3-post
 *   portfolio) was invented example copy with nothing behind it. The rules
 *   shown here instead are the ones this app actually enforces: Track B
 *   needs manager review + a portfolio (see CreateEditOpportunity.jsx's
 *   "Portfolio / relevant work required" note and opportunityController.js's
 *   validation), Track A is auto-approved with no barrier.
 * - Save and Apply/Claim are both live now (Application + saved-opportunity
 *   backends exist): Save toggles the bookmark in place; Apply/Claim
 *   navigates to the dedicated Claim (07-track-a-claim.html) or Express
 *   Interest (08-track-b-express-interest.html) form rather than submitting
 *   right from this page, matching those mockups' own flow. If the
 *   volunteer already has a live application here, the CTA reflects that
 *   instead of offering to apply again.
 */

const CIRCUMFERENCE = 339; // 2 * PI * 54 (the ring's radius), matches the mockup's SVG

// duration/timeCommitment are plain numbers now (weeks / hrs per week — see
// models/Opportunity.js), so the unit is added at render time rather than
// typed in by whoever created the opportunity.
function formatDuration(weeks) {
  return weeks ? `${weeks} week${weeks === 1 ? '' : 's'}` : '';
}
function formatTimeCommitment(hrsPerWeek) {
  return hrsPerWeek ? `${hrsPerWeek} hrs/week` : '';
}
function formatTimeBit(opp) {
  return formatTimeCommitment(opp.timeCommitment) || formatDuration(opp.duration) || 'Flexible';
}

export default function OpportunityDetail() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [opp, setOpp] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [myApplication, setMyApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  const [saved, setSaved] = useState(false);
  const [savingBookmark, setSavingBookmark] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setError('');
    apiGet(`/volunteer/opportunities/${id}`)
      .then((data) => {
        setOpp(data.opportunity);
        setSimilar(data.similar || []);
        setMyApplication(data.myApplication || null);
        setSaved(!!data.opportunity?.isSaved);
      })
      .catch((err) => {
        if (err.status === 404) setNotFound(true);
        else setError(err.message || 'Could not load this opportunity.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const toggleSaved = async () => {
    setSavingBookmark(true);
    try {
      if (saved) {
        await apiDelete(`/volunteer/saved/${id}`);
        setSaved(false);
      } else {
        await apiPost(`/volunteer/saved/${id}`);
        setSaved(true);
      }
    } catch {
      // non-fatal — bookmark state just doesn't change if this fails
    } finally {
      setSavingBookmark(false);
    }
  };

  const sidebar = (
    <>
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-wrap">
            <div className="logo-lockup">
              <span className="logo-word">STart</span>
              <span className="logo-sub">by SankalpTaru</span>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">Main</div>
            <a className="nav-item" onClick={() => navigate('/dashboard')}>
              <span className="icon">🏠</span>Dashboard
            </a>
            <a className="nav-item active" onClick={() => navigate('/find-opportunities')}>
              <span className="icon">🔍</span>Opportunities
            </a>
          </div>
        </nav>
      </aside>
      <div className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />
    </>
  );

  const topbar = (title) => (
    <div className="topbar">
      <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
      <div className="breadcrumb">
        <a onClick={() => navigate('/find-opportunities')}>← Opportunities</a>
        {title && <><span>/</span><span>{title}</span></>}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="volunteer-shell page-opportunity-detail">
        {sidebar}
        <div className="main">
          {topbar()}
          <div className="content-wrap"><div className="empty-state" style={{ width: '100%' }}><div className="e-icon">🎯</div><p>Loading opportunity…</p></div></div>
        </div>
      </div>
    );
  }

  if (notFound || error) {
    return (
      <div className="volunteer-shell page-opportunity-detail">
        {sidebar}
        <div className="main">
          {topbar()}
          <div className="content-wrap">
            <div className="empty-state" style={{ width: '100%' }}>
              <div className="e-icon">{notFound ? '🪴' : '⚠️'}</div>
              <p>{notFound ? "This opportunity doesn't exist or is no longer available." : error}</p>
              <button className="btn-ghost" style={{ marginTop: 14 }} onClick={() => navigate('/find-opportunities')}>Back to Opportunities</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isEvergreen = opp.isEvergreen;
  const dashoffset = isEvergreen ? 0 : CIRCUMFERENCE - (CIRCUMFERENCE * (opp.matchScore || 0)) / 100;

  return (
    <div className="volunteer-shell page-opportunity-detail">
      {sidebar}
      <div className="main">
        {topbar(opp.title)}

        {/* HERO */}
        <div className="hero">
          <div className="hero-tag">{isEvergreen ? '🌿 Evergreen Opportunity — Track A' : '📋 Track B — Manager Reviewed'}</div>
          <h1>{opp.title}</h1>
          <div className="hero-meta">
            <span className="hero-meta-item">{opp.mode === 'Remote' ? '🌐' : '🏞️'} <strong>{opp.mode}</strong></span>
            {opp.timeCommitment && <span className="hero-meta-item">⏱️ <strong>{formatTimeCommitment(opp.timeCommitment)}</strong></span>}
            {opp.duration && <span className="hero-meta-item">📆 <strong>{formatDuration(opp.duration)}</strong></span>}
            <span className="hero-meta-item">👥 <strong>{opp.capacity ? (opp.isFull ? 'Full' : `${opp.capacity} spots`) : 'Unlimited'}</strong></span>
          </div>
        </div>

        {/* Capacity reached — the manager's chosen number of volunteers are
            already shortlisted (or further along) on this Track B project,
            so it's shown as unavailable rather than letting more volunteers
            apply into a project that's already staffed. Never shown for
            Track A (never capacity-limited) or once the visiting volunteer
            already has their own application here. */}
        {!isEvergreen && opp.isFull && !(myApplication && !['withdrawn', 'not_selected'].includes(myApplication.status)) && (
          <div className="capacity-banner">
            ⛔ This opportunity has reached its volunteer capacity and is no longer accepting new applications.
          </div>
        )}

        <div className="content-wrap">
          <div className="detail-left">
            <div className="info-grid">
              <div className="info-tile"><div className="tile-icon">{opp.mode === 'Remote' ? '🌐' : '🌳'}</div><div className="tile-label">Mode</div><div className="tile-value">{opp.mode}</div></div>
              <div className="info-tile"><div className="tile-icon">⏱️</div><div className="tile-label">Time</div><div className="tile-value">{formatTimeCommitment(opp.timeCommitment) || '—'}</div></div>
              <div className="info-tile"><div className="tile-icon">📆</div><div className="tile-label">Duration</div><div className="tile-value">{formatDuration(opp.duration) || '—'}</div></div>
              <div className="info-tile"><div className="tile-icon">👥</div><div className="tile-label">Capacity</div><div className="tile-value">{opp.capacity ? (opp.isFull ? 'Full' : opp.capacity) : 'Unlimited'}</div></div>
              <div className="info-tile"><div className="tile-icon">🏅</div><div className="tile-label">Certificate</div><div className="tile-value">{isEvergreen ? 'Instant' : 'On Approval'}</div></div>
              <div className="info-tile"><div className="tile-icon">✅</div><div className="tile-label">Review</div><div className="tile-value">{isEvergreen ? 'Auto' : 'Manager'}</div></div>
            </div>

            <div className="detail-section">
              <h3>📌 About this Opportunity</h3>
              <p>{opp.overview}</p>
              {opp.depts?.length > 0 && (
                <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--gray-400)' }}>
                  Run by the {opp.depts.join(', ')} team{opp.depts.length > 1 ? 's' : ''}.
                </p>
              )}
            </div>

            {opp.whatYouWillDo && (
              <div className="detail-section">
                <h3>🛠️ What You'll Do</h3>
                <ul>
                  {opp.whatYouWillDo.split('\n').filter(Boolean).map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </div>
            )}

            {opp.whatYouWillLearn && (
              <div className="detail-section">
                <h3>🎓 What You'll Learn</h3>
                <ul>
                  {opp.whatYouWillLearn.split('\n').filter(Boolean).map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </div>
            )}

            <div className="detail-section">
              <h3>📋 Requirements</h3>
              <ul>
                {isEvergreen ? (
                  <>
                    <li>No prior experience or specific skills needed — open to everyone.</li>
                    <li>Auto-approved instantly, no review wait.</li>
                    <li>Certificate generated automatically on submission.</li>
                  </>
                ) : (
                  <>
                    <li>Reviewed and approved by the owning department's manager before you're confirmed.</li>
                    <li>A portfolio or relevant work sample strengthens your application for Track B roles.</li>
                    <li>Certificate generated automatically once your work is approved.</li>
                  </>
                )}
              </ul>
            </div>
          </div>

          <div className="detail-right">
            <div className="match-ring-card">
              {isEvergreen ? (
                <>
                  <h4>🌱 Open To Everyone</h4>
                  <div className="evergreen-open">✅</div>
                  <div className="ring-label">No matching needed — anyone can take this on.</div>
                </>
              ) : (
                <>
                  <h4>🎯 Your Match Score</h4>
                  <div className="ring-wrap">
                    <svg className="ring-svg" viewBox="0 0 120 120" width="120" height="120">
                      <circle className="ring-bg" cx="60" cy="60" r="54" />
                      <circle className="ring-fill" cx="60" cy="60" r="54" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={dashoffset} />
                    </svg>
                    <div className="ring-num">{opp.matchScore}%</div>
                  </div>
                  <div className="ring-label">
                    {opp.matchScore >= 80 ? 'Excellent match for your profile' : opp.matchScore >= 50 ? 'Good match for your profile' : 'Might be a stretch, but worth a look'}
                  </div>
                  {opp.matchReasons?.length > 0 && (
                    <div className="match-reasons">
                      {opp.matchReasons.map((r, i) => (
                        <div className="match-reason-item" key={i}><span className="dot" />{r}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {opp.skills?.length > 0 && (
              <div className="skills-card">
                <h4>💡 Skills Needed</h4>
                <div>
                  {opp.skills.map((s) => <span className="skill-tag" key={s}>{s}</span>)}
                </div>
              </div>
            )}

            {/* Track B only — SRS/briefs/reference material a manager
                attached (see CreateEditOpportunity.jsx's Related Documents
                section) so a volunteer can actually understand the project
                before applying. */}
            {!isEvergreen && opp.documents?.length > 0 && (
              <div className="skills-card">
                <h4>📄 Related Documents</h4>
                <div className="doc-links">
                  {opp.documents.map((d) => (
                    <a href={d.url} target="_blank" rel="noreferrer" className="doc-link" key={d.id}>
                      📄 {d.fileName}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {similar.length > 0 && (
          <div className="similar-section">
            <h3>Similar Opportunities</h3>
            <div className="similar-grid">
              {similar.map((s) => (
                <div className="similar-card" key={s.id} onClick={() => navigate(`/find-opportunities/${s.id}`)}>
                  <h5>{s.title}</h5>
                  <p>{s.mode === 'Remote' ? '🌐' : '🏞️'} {s.mode} · {formatTimeBit(s)}</p>
                  <div className="sc-footer">
                    {s.isFull ? (
                      <span className="sc-full">Full</span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Track B</span>
                    )}
                    <span className="sc-match">{s.matchScore}% match</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* STICKY CTA */}
      <div className="sticky-cta">
        <div className="cta-info">
          <h4>{opp.title}</h4>
          <p>{opp.mode} · {formatTimeBit(opp)} · Certificate included</p>
        </div>
        <div className="cta-btns">
          <button className="btn-secondary" onClick={toggleSaved} disabled={savingBookmark}>
            {saved ? '🔖 Saved' : '🔖 Save'}
          </button>
          {myApplication && !['withdrawn', 'not_selected'].includes(myApplication.status) ? (
            <button className={isEvergreen ? 'btn-primary-a' : 'btn-primary-b'} onClick={() => navigate('/my-applications')}>
              {myApplication.chip.label} — View →
            </button>
          ) : !isEvergreen && opp.isFull ? (
            <button className="btn-secondary" disabled title="This opportunity has reached its volunteer capacity.">
              🚫 Opportunity Full
            </button>
          ) : (
            <button
              className={isEvergreen ? 'btn-primary-a' : 'btn-primary-b'}
              onClick={() => navigate(isEvergreen ? `/claim/${id}` : `/apply/${id}`)}
            >
              {isEvergreen ? 'Claim Now →' : 'Express Interest →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
