import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './VolunteerEngagement.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Admin/manager read-only view of a single volunteer's engagement — the
 * same data volunteer/MyEngagement.jsx shows to the volunteer themselves
 * (level ring, levels path, metric grid, activity heatmap, top skills,
 * achievements), just for whichever volunteer an admin/manager clicked
 * through to from the Volunteers directory (Volunteers.jsx row click ->
 * /volunteers/:id/engagement).
 *
 * Backed by GET /api/admin/volunteers/:id/engagement
 * (volunteerAdminController.getVolunteerEngagement), which reuses the exact
 * same views/engagementView.js#buildEngagementSummary the volunteer-facing
 * endpoint uses — just computed for :id instead of req.user.id. See that
 * controller/view for what's real data vs a designed formula (Volunteer
 * Score, level thresholds) — nothing here is re-derived independently.
 *
 * Layout: AdminShell chrome (sidebar/topbar), same as every other admin
 * page, with the engagement content itself adapted from MyEngagement.jsx
 * (see VolunteerEngagement.css, adapted from MyEngagement.css) plus a
 * volunteer identity header this page adds so the admin knows whose data
 * they're looking at.
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

const ROLE_SHELL = {
  super: {
    userName: 'Apurva',
    userRole: 'Super Admin',
    avatarInitial: 'A',
    roleChip: 'Super Admin · All Departments',
    showAdminSection: true,
  },
  head: {
    userName: 'Amit',
    userRole: 'Department Head · Programs',
    avatarInitial: 'V',
    roleChip: 'Department Head · Programs',
    showAdminSection: false,
  },
};

const ENGAGEMENT_LABELS = {
  student: 'Student',
  professional: 'Working Professional',
  freelancer: 'Freelancer',
  homemaker: 'Homemaker',
  retired: 'Retired',
  other: 'Other',
};

const HMAP_LEGEND = ['var(--gray-100)', '#c6e48b', '#7bc96f', 'var(--forest)', 'var(--deep)'];
const RING_CIRCUMFERENCE = 264; // 2 * PI * r(42), matches the SVG below

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function VolunteerEngagement() {
  const navigate = useNavigate();
  const { id } = useParams();

  const isAdmin = localStorage.getItem('st_role') === 'admin';
  const [role] = useState(isAdmin ? 'super' : 'head');
  const shell = ROLE_SHELL[role];

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    apiRequest(`/volunteers/${id}/engagement`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((err) => {
        if (err.status === 404) setNotFound(true);
        setError(err.message || 'Could not load this volunteer’s engagement data.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  const level = data?.level;
  const metrics = data?.metrics;
  const volunteer = data?.volunteer;
  const ringOffset = level ? RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * level.progressPct) / 100 : RING_CIRCUMFERENCE;

  return (
    <div className="dash-page page-volunteer-engagement">
      {/* SIDEBAR */}
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
            <a className="nav-item" href="/admin-dashboard">
              <span className="icon">🏠</span>Dashboard
            </a>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Opportunities</div>
            <a className="nav-item" href="/opportunities">
              <span className="icon">🌱</span>Opportunities
            </a>
            <a className="nav-item" href="/applications">
              <span className="icon">📋</span>Applications
            </a>
            <a className="nav-item" href="/task-board">
              <span className="icon">🗂️</span>Task Board
            </a>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Volunteers</div>
            <a className="nav-item active" href="/volunteers">
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

      {/* MAIN */}
      <div className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <div className="topbar-title">Volunteer Engagement</div>
          <div className="topbar-right">
            <span className="topbar-role-chip">{shell.roleChip}</span>
            <ProfileMenu avatarInitial={shell.avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
          </div>
        </div>

        <div className="content">
          <div className="page-head">
            <div>
              <button className="back-link" onClick={() => navigate('/volunteers')}>
                ← Back to Volunteers
              </button>
              <h1>{volunteer ? volunteer.name : 'Volunteer Engagement'}</h1>
              {volunteer && (
                <p>
                  {volunteer.email}
                  {volunteer.district ? ` · ${volunteer.district}` : ''}
                  {volunteer.engagement ? ` · ${ENGAGEMENT_LABELS[volunteer.engagement] || volunteer.engagement}` : ''}
                  {' · Registered '}
                  {formatDate(volunteer.registered)}
                </p>
              )}
            </div>
          </div>

          {error && (notFound || !data) && <p className="form-error">{error}</p>}

          {loading || !data ? (
            <div className="empty-state">
              <div className="e-icon">📊</div>
              <p>{notFound ? 'This volunteer could not be found.' : 'Loading engagement data…'}</p>
            </div>
          ) : (
            <>
              {/* LEVEL HERO */}
              <div className="level-hero">
                <div className="level-hero-inner">
                  <div className="level-ring-wrap">
                    <svg width="100" height="100" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="8" />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="#9AD14B"
                        strokeWidth="8"
                        strokeDasharray={RING_CIRCUMFERENCE}
                        strokeDashoffset={ringOffset}
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                      />
                      <text x="50" y="46" textAnchor="middle" fontSize="18" fontWeight="800" fill="white" fontFamily="Plus Jakarta Sans">
                        {level.hours}
                      </text>
                      <text x="50" y="60" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,.7)" fontFamily="Plus Jakarta Sans">
                        hrs logged
                      </text>
                    </svg>
                  </div>
                  <div className="level-info">
                    <h2>
                      {level.icon} {level.name}
                    </h2>
                    <p className="level-sub">{volunteer?.name}'s current volunteer level.</p>
                    <div className="level-bar-wrap">
                      {level.nextName ? (
                        <>
                          <div className="level-bar-label">
                            <span>Progress to {level.nextName}</span>
                            <span>
                              {level.hours}/{level.nextMinHours} hrs
                            </span>
                          </div>
                          <div className="level-bar">
                            <div className="level-fill" style={{ width: `${level.progressPct}%` }} />
                          </div>
                          <div className="level-next">
                            {level.hoursToNext} more hour{level.hoursToNext === 1 ? '' : 's'} to unlock {level.nextName} status
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="level-bar-label">
                            <span>Top level reached</span>
                            <span>{level.hours} hrs</span>
                          </div>
                          <div className="level-bar">
                            <div className="level-fill" style={{ width: '100%' }} />
                          </div>
                          <div className="level-next">Reached Sustainability Hero — the highest level!</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* LEVELS PATH */}
              <div className="levels-path-card">
                <h3>🏆 Volunteer Level Journey</h3>
                <div className="levels-path">
                  {data.levelsPath.map((l, i) => (
                    <Fragment key={l.key}>
                      <div className="level-node">
                        <div className={`l-icon ${l.done ? 'done' : ''} ${l.current ? 'current' : ''}`}>{l.icon}</div>
                        <div className={`l-name ${l.done ? 'done' : ''} ${l.current ? 'current' : ''}`}>
                          {l.name}
                          <br />
                          <span style={{ opacity: l.current ? 1 : 0.6 }}>
                            {l.minHours} hrs{l.done || l.current ? ' ✓' : ''}
                          </span>
                        </div>
                      </div>
                      {i < data.levelsPath.length - 1 && <div className={`level-connector ${l.done ? 'done' : ''}`} />}
                    </Fragment>
                  ))}
                </div>
              </div>

              {/* METRIC GRID */}
              <div className="metric-grid">
                <div className="metric-card">
                  <div className="m-icon">⏱️</div>
                  <div className="m-num">{metrics.totalHours}</div>
                  <div className="m-label">Total Hours</div>
                </div>
                <div className="metric-card">
                  <div className="m-icon">✅</div>
                  <div className="m-num">{metrics.completedCount}</div>
                  <div className="m-label">Completed</div>
                </div>
                <div className="metric-card">
                  <div className="m-icon">📢</div>
                  <div className="m-num">{metrics.campaignsSupported}</div>
                  <div className="m-label">Campaigns Supported</div>
                </div>
                <div className="metric-card">
                  <div className="m-icon">🏕️</div>
                  <div className="m-num">{metrics.fieldEvents}</div>
                  <div className="m-label">Field Events</div>
                </div>
                <div className="metric-card">
                  <div className="m-icon">🏅</div>
                  <div className="m-num">{metrics.certificatesCount}</div>
                  <div className="m-label">Certificates</div>
                </div>
                <div className="metric-card">
                  <div className="m-icon">⭐</div>
                  <div className="m-num">{metrics.volunteerScore}</div>
                  <div className="m-label">Volunteer Score</div>
                </div>
              </div>

              {/* HEATMAP */}
              <div className="heatmap-card">
                <h3>Activity Heatmap — Last 6 Months</h3>
                <div className="heatmap-grid">
                  {data.heatmap.map((d) => (
                    <div
                      key={d.date}
                      className="hmap-cell"
                      style={{ background: HMAP_LEGEND[d.level] }}
                      title={`${formatDate(d.date)}: ${d.count === 0 ? 'No activity' : `${d.count} action${d.count === 1 ? '' : 's'}`}`}
                    />
                  ))}
                </div>
                <div className="hmap-legend">
                  <span>Less</span>
                  {HMAP_LEGEND.map((c) => (
                    <div className="l-cell" key={c} style={{ background: c }} />
                  ))}
                  <span>More</span>
                </div>
              </div>

              {/* SKILLS + ACHIEVEMENTS */}
              <div className="two-col">
                <div className="section-card">
                  <h3>🎯 Top Skills Used</h3>
                  {data.skills.length === 0 ? (
                    <div className="empty-state">
                      <div className="e-icon">🎯</div>
                      <p>No completed opportunities yet.</p>
                      <div className="e-note">Skills show up here once this volunteer completes their first opportunity.</div>
                    </div>
                  ) : (
                    data.skills.map((s) => (
                      <div className="skill-bar-row" key={s.name}>
                        <span className="s-label">{s.name}</span>
                        <div className="skill-bar">
                          <div className="skill-fill" style={{ width: `${s.pct}%` }} />
                        </div>
                        <span className="skill-pct">{s.count}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="section-card">
                  <h3>🏅 Achievements</h3>
                  <div className="achievements-grid">
                    {data.achievements.map((a) => (
                      <div className={`ach-card ${a.earned ? '' : 'locked'}`} key={a.key}>
                        <div className="ach-icon">{a.icon}</div>
                        <div className="ach-name">{a.name}</div>
                        <div className="ach-desc">{a.desc}</div>
                        <div className="ach-earned">{a.earned ? `Earned ${formatDate(a.earnedAt)}` : a.progress ? `🔒 ${a.progress}` : '🔒 Locked'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
