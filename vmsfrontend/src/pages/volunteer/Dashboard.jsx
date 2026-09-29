import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from './api';
import './Dashboard.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Converted from 10-dashboard.html. This is the volunteer's real landing
 * page after login (Login.jsx already navigates returning volunteers to
 * /dashboard — that route just didn't exist yet until this page).
 *
 * WHAT'S REAL vs PLACEHOLDER:
 * - Name, avatar initial, and profile completion % are real, computed from
 *   the volunteer's actual profile (GET /volunteer/profile).
 * - "Recommended For You" is real: GET /volunteer/opportunities/recommended
 *   returns Gemini-matched Track B opportunities (cached server-side, see
 *   controllers/volunteerOpportunityController.js) plus Track A ("Always
 *   Open") opportunities, which don't need matching at all.
 * - "My Applications" is now real too: GET /volunteer/applications (see
 *   controllers/volunteerApplicationController.js), same as MyApplications.jsx.
 * - Hours Volunteered, Certificates Earned, Trees Supported, Level/points,
 *   and My Impact are now real too: GET /volunteer/engagement (same
 *   endpoint MyEngagement.jsx uses — see
 *   controllers/volunteerEngagementController.js /
 *   views/engagementView.js for exactly how each number is derived, and
 *   which one designed formula (Volunteer Score) isn't a literal DB count).
 * - Active Tasks and Recent Activity are still NOT backed by real data —
 *   there's no "active task feed" concept anywhere else in this app to
 *   pull from. Rather than invent fake entries, these sections keep their
 *   honest empty states.
 */

// Fields that count toward "profile complete" — mirrors what Profile.jsx
// (required, worth the bulk of the bar) and Skills.jsx (worth the rest)
// actually collect. photoUrl/portfolio are optional extras, which is also
// why the nudge below specifically calls out portfolio when it's missing.
// Maps an application's real status onto Dashboard.css's existing three dot
// colors (.app-dot.review/.shortlisted/.completed) — those were already
// defined here before this preview had real data to render, just unused.
const STATUS_DOT = {
  under_review: 'review',
  claimed: 'review',
  submitted: 'review',
  shortlisted: 'shortlisted',
  task_assigned: 'shortlisted',
  completed: 'completed',
};

const RING_CIRCUMFERENCE = 314; // 2 * PI * r(50), matches the "Level Progress" SVG below

function computeCompletion(user) {
  if (!user) return 0;
  let pct = 0;
  if (user.profileCompletedAt) pct += 40;
  if (user.skillsCompletedAt) pct += 40;
  if (user.photoUrl) pct += 10;
  if (user.portfolio) pct += 10;
  return pct;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [user, setUser] = useState(null);
  const [profileError, setProfileError] = useState('');

  const [evergreen, setEvergreen] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [recLoading, setRecLoading] = useState(true);
  const [recError, setRecError] = useState('');

  const [applications, setApplications] = useState([]);
  const [appCounts, setAppCounts] = useState({ all: 0 });
  const [appsLoading, setAppsLoading] = useState(true);

  const [engagement, setEngagement] = useState(null);
  const [engLoading, setEngLoading] = useState(true);

  useEffect(() => {
    apiGet('/volunteer/profile')
      .then((data) => setUser(data.user))
      .catch((err) => setProfileError(err.message || 'Could not load your profile.'));
  }, []);

  // Hours / certificates / level / impact — same GET /volunteer/engagement
  // MyEngagement.jsx uses, so this always matches that page exactly. See
  // this file's header comment for what's real vs a designed formula.
  useEffect(() => {
    apiGet('/volunteer/engagement')
      .then((data) => setEngagement(data))
      .catch(() => {
        /* non-fatal — stat cards just fall back to 0 below */
      })
      .finally(() => setEngLoading(false));
  }, []);

  useEffect(() => {
    setRecLoading(true);
    apiGet('/volunteer/opportunities/recommended?limit=2')
      .then((data) => {
        setEvergreen(data.evergreen || []);
        setRecommended(data.recommended || []);
        setRecError('');
      })
      .catch((err) => setRecError(err.message || 'Could not load recommendations.'))
      .finally(() => setRecLoading(false));
  }, []);

  useEffect(() => {
    apiGet('/volunteer/applications?status=active')
      .then((data) => {
        setApplications(data.applications || []);
        // counts is computed server-side from ALL of this volunteer's
        // applications regardless of the ?status=active filter above — see
        // volunteerApplicationController.listMyApplications — so
        // counts.all is the real lifetime "Applications" stat, not just
        // the active ones this call otherwise renders.
        if (data.counts) setAppCounts(data.counts);
      })
      .catch(() => {
        /* non-fatal — the preview card just falls back to its empty state */
      })
      .finally(() => setAppsLoading(false));
  }, []);

  const completion = computeCompletion(user);
  const firstName = user?.firstName || 'there';
  const avatarInitial = (user?.firstName || user?.email || '?').charAt(0).toUpperCase();

  const level = engagement?.level;
  const metrics = engagement?.metrics;
  const ringOffset = level ? RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * level.progressPct) / 100 : RING_CIRCUMFERENCE;

  // Dashboard shows a compact preview: up to 2 Gemini-matched Track B
  // opportunities + 1 Track A ("Always Open") pick, matching the mockup's
  // 3-card "Recommended For You" layout. The full ranked, filterable list
  // lives on /find-opportunities (Opportunities.jsx).
  //
  // `recommended` only ever contains Track B matches once the volunteer
  // has actually selected skills (see getRecommendedOpportunities on the
  // backend — matching against an empty skill set is meaningless, so it
  // returns Track B as empty rather than a wall of 0% matches). Track A
  // never depended on skills or even overall profile completion, so it
  // fills the whole preview by itself when there's nothing matched yet,
  // instead of leaving 2 of the 3 preview slots looking broken/empty.
  const recCards = recommended.length > 0
    ? [
        ...recommended.slice(0, 2).map((o) => ({ ...o, kind: 'matched' })),
        ...evergreen.slice(0, 1).map((o) => ({ ...o, kind: 'evergreen' })),
      ]
    : evergreen.slice(0, 3).map((o) => ({ ...o, kind: 'evergreen' }));

  return (
    <div className="volunteer-shell page-dashboard">
      {/* SIDEBAR */}
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
            <a className="nav-item active">
              <span className="icon">🏠</span>Dashboard
            </a>
            <a className="nav-item" onClick={() => navigate('/find-opportunities')}>
              <span className="icon">🔍</span>Opportunities
            </a>
          </div>
          <div className="nav-section">
            <div className="nav-section-title">My Volunteering</div>
            <a className="nav-item" onClick={() => navigate('/my-applications')}>
              <span className="icon">📋</span>My Applications
            </a>
            <a className="nav-item" onClick={() => navigate('/my-tasks')}>
              <span className="icon">✅</span>My Tasks
            </a>
            <a className="nav-item" onClick={() => navigate('/saved')}>
              <span className="icon">🔖</span>Saved
            </a>
          </div>
          <div className="nav-section">
            <div className="nav-section-title">Progress</div>
            <a className="nav-item" onClick={() => navigate('/my-engagement')}>
              <span className="icon">📊</span>My Engagement
            </a>
            <a className="nav-item" onClick={() => navigate('/my-certificates')}>
              <span className="icon">🏅</span>Certificates
            </a>
          </div>
          <div className="nav-section">
            <div className="nav-section-title">Account</div>
            <a className="nav-item" onClick={() => navigate('/edit-profile')}>
              <span className="icon">⚙️</span>Profile Settings
            </a>
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="avatar">{user?.photoUrl ? <img className="avatar-photo" src={user.photoUrl} alt="" /> : avatarInitial}</div>
            <div className="user-info">
              <div className="name">{user ? `${user.firstName} ${user.lastName}`.trim() || user.email : '…'}</div>
              <div className="role">Volunteer</div>
            </div>
          </div>
        </div>
      </aside>
      <div className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* MAIN */}
      <div className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
          <div className="topbar-title">Dashboard</div>
          <div className="topbar-right">
            <button className="notif-btn" aria-label="Notifications">
              🔔
              <div className="notif-dot" />
            </button>
            <ProfileMenu avatarInitial={avatarInitial} avatarClassName="avatar" profilePath="/my-profile" />
          </div>
        </div>

        <div className="content">
          {profileError && <p className="form-error">{profileError}</p>}

          {completion < 100 && (
            <div className="nudge">
              <span className="n-icon">💡</span>
              <p>
                Your profile is <strong>{completion}% complete</strong>.{' '}
                {!user?.portfolio
                  ? 'Add a portfolio link to improve your opportunity matches and unlock better recommendations.'
                  : 'Finish your profile to improve your opportunity matches.'}
              </p>
              {/* Always routes to the real Profile Settings page now
                  (EditProfile.jsx) — pre-filled, single save, works
                  whether the profile is fully complete, partially done,
                  or never started, unlike the old conditional that sent
                  volunteers back into the onboarding wizard steps. */}
              <button className="n-btn" onClick={() => navigate('/edit-profile')}>
                Complete Profile →
              </button>
            </div>
          )}

          {/* WELCOME STRIP */}
          <div className="welcome-card">
            <div className="welcome-left">
              <h2>Welcome back, {firstName}! 🌿</h2>
              <p>You've made a difference. Keep growing your impact.</p>
              <div className="profile-bar"><div className="profile-fill" style={{ width: `${completion}%` }} /></div>
              <div className="profile-bar-label"><span>Profile: {completion}% complete</span><span>{completion}%</span></div>
            </div>
            <div className="level-badge" style={{ cursor: 'pointer' }} onClick={() => navigate('/my-engagement')}>
              <div className="level-icon">{level ? level.icon : '🌱'}</div>
              <div className="level-name">{engLoading ? 'Loading…' : level ? level.name : 'New Volunteer'}</div>
              <div className="level-pts">
                {engLoading
                  ? ' '
                  : level?.nextName
                  ? `${level.hoursToNext} hr${level.hoursToNext === 1 ? '' : 's'} to ${level.nextName}`
                  : level
                  ? 'Top level reached'
                  : 'Hours & level tracking'}
              </div>
            </div>
          </div>

          {/* STAT GRID — real numbers from GET /volunteer/engagement (same
              source as MyEngagement.jsx) + the applications count already
              fetched above. See this file's header for what each is
              derived from. */}
          <div className="stat-grid">
            <div className="stat-card">
              <div className="s-icon">📋</div>
              <div className="s-num">{appCounts.all ?? 0}</div>
              <div className="s-label">Applications</div>
              <div className="s-trend">{appCounts.active ?? 0} active</div>
            </div>
            <div className="stat-card">
              <div className="s-icon">⏱️</div>
              <div className="s-num">{metrics ? metrics.totalHours : 0}</div>
              <div className="s-label">Hours Volunteered</div>
              <div className="s-trend">{level ? `${level.icon} ${level.name}` : '—'}</div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/my-certificates')}>
              <div className="s-icon">🏅</div>
              <div className="s-num">{metrics ? metrics.certificatesCount : 0}</div>
              <div className="s-label">Certificates Earned</div>
              <div className="s-trend">View all →</div>
            </div>
            <div className="stat-card">
              <div className="s-icon">🌳</div>
              <div className="s-num">{metrics ? metrics.treesSupported : 0}</div>
              <div className="s-label">Trees Supported</div>
              <div className="s-trend">Track A completions</div>
            </div>
          </div>

          {/* MAIN GRID */}
          <div className="dash-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="section-card">
                <h3>My Applications {applications.length > 0 && <a onClick={() => navigate('/my-applications')} style={{ float: 'right', fontSize: 13 }}>See all →</a>}</h3>
                {appsLoading ? (
                  <div className="empty-state"><div className="e-icon">📋</div><p>Loading…</p></div>
                ) : applications.length === 0 ? (
                  <div className="empty-state">
                    <div className="e-icon">📋</div>
                    <p>You haven't applied to any opportunities yet.</p>
                    <div className="e-note">Applications will show up here once you apply.</div>
                  </div>
                ) : (
                  applications.slice(0, 3).map((a) => (
                    <div key={a.id} className="app-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/my-applications')}>
                      <span className={`app-dot ${STATUS_DOT[a.status] || 'review'}`} />
                      <div className="app-body">
                        <h4>{a.opportunity.title}</h4>
                        <div className="app-meta">
                          <span className={`status-chip ${a.track === 'a' ? 'track-a' : 'track-b'}`}>{a.track === 'a' ? 'Track A' : 'Track B'}</span>
                          <span className="status-chip" style={{ background: 'var(--gray-100)', color: 'var(--gray-600)' }}>{a.chip.label}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="section-card">
                <h3>My Active Tasks</h3>
                <div className="empty-state">
                  <div className="e-icon">✅</div>
                  <p>No active tasks right now.</p>
                  <div className="e-note">Tasks appear here once you're assigned to an opportunity.</div>
                </div>
              </div>

              <div className="section-card">
                <h3>Recent Activity</h3>
                <div className="empty-state">
                  <div className="e-icon">🕓</div>
                  <p>No activity yet.</p>
                  <div className="e-note">Your applications, certificates, and milestones will appear here.</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="section-card" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => navigate('/my-engagement')}>
                <h3 style={{ justifyContent: 'center' }}>Level Progress</h3>
                <div className="ring-wrap">
                  <svg className="ring" width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--gray-100)" strokeWidth="10" />
                    <circle
                      cx="60" cy="60" r="50" fill="none" stroke="var(--lime)" strokeWidth="10"
                      strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={ringOffset} strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                    />
                    <text x="60" y="55" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--deep)" fontFamily="Plus Jakarta Sans">{level ? level.hours : 0}</text>
                    <text x="60" y="72" textAnchor="middle" fontSize="11" fill="var(--gray-400)" fontFamily="Plus Jakarta Sans">hrs logged</text>
                  </svg>
                  <div className="ring-label">
                    {level ? `${level.icon} ${level.name}` : '🌱 New Volunteer'}<br />
                    <strong>
                      {engLoading
                        ? 'Loading…'
                        : level?.nextName
                        ? `${level.hoursToNext} hr${level.hoursToNext === 1 ? '' : 's'} to ${level.nextName}`
                        : 'Top level reached'}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="section-card">
                <h3>My Impact</h3>
                <div className="impact-highlights">
                  <div className="impact-row">
                    <div className="i-left"><span className="i-icon">🌳</span><span className="i-label">Trees Supported</span></div>
                    <span className="i-val">{metrics ? metrics.treesSupported : 0}</span>
                  </div>
                  <div className="impact-row">
                    <div className="i-left"><span className="i-icon">📚</span><span className="i-label">Campaigns Supported</span></div>
                    <span className="i-val">{metrics ? metrics.campaignsSupported : 0}</span>
                  </div>
                  <div className="impact-row">
                    <div className="i-left"><span className="i-icon">🤝</span><span className="i-label">Events Attended</span></div>
                    <span className="i-val">{metrics ? metrics.fieldEvents : 0}</span>
                  </div>
                </div>
              </div>

              <div className="section-card">
                <h3>Recommended For You <a onClick={() => navigate('/find-opportunities')}>See all →</a></h3>
                {recError && <p className="form-error">{recError}</p>}
                {recLoading ? (
                  <div className="empty-state">
                    <div className="e-icon">🎯</div>
                    <p>Finding your best matches…</p>
                  </div>
                ) : recCards.length === 0 ? (
                  <div className="empty-state">
                    <div className="e-icon">🪴</div>
                    <p>No open opportunities right now.</p>
                    <div className="e-note">Check back soon — new opportunities are added regularly.</div>
                  </div>
                ) : (
                  recCards.map((o) => (
                    <div className="rec-card" key={o.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/find-opportunities/${o.id}`)}>
                      <div className="rec-card-top">
                        <h4>{o.title}</h4>
                        {o.kind === 'evergreen' ? (
                          <span className="match-badge" style={{ background: 'var(--forest)', color: 'white' }}>🌱 Evergreen</span>
                        ) : o.isFull ? (
                          <span className="match-badge" style={{ background: 'rgba(220,38,38,.12)', color: '#b91c1c' }}>Full</span>
                        ) : (
                          <span className="match-badge">{o.matchScore}%</span>
                        )}
                      </div>
                      <div className="rec-meta">
                        {/* duration/timeCommitment are now plain numbers
                            (weeks / hrs per week) — see models/Opportunity.js —
                            so the unit is added here rather than typed in by
                            whoever created the opportunity. */}
                        {o.mode} · {o.timeCommitment ? `${o.timeCommitment} hrs/week` : o.duration ? `${o.duration} wk${o.duration === 1 ? '' : 's'}` : 'Flexible'} · Track {o.track.toUpperCase()}
                      </div>
                      {o.kind === 'matched' && o.matchReasons?.length > 0 && (
                        <div className="rec-reasons">{o.matchReasons[0]}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
