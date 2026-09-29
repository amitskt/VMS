import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from './api';
import './MyEngagement.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Converted from 14-my-engagement.html, wired to a real backend endpoint
 * (GET /volunteer/engagement — see controllers/volunteerEngagementController.js).
 *
 * WHAT'S REAL vs DESIGNED (see views/engagementView.js's file header for the
 * full explanation):
 * - Total Hours / the level ring / the levels path are all driven by
 *   Task.contributionHours on approved Track B tasks — the only place this
 *   app actually records a number of hours. Track A completions still count
 *   toward Completed / Campaigns Supported / Certificates below, just not
 *   toward hours (there's nothing to log against — Track A never asks for a
 *   duration anywhere in the app).
 * - Volunteer Score is a simple, documented formula, not an external metric.
 * - The heatmap buckets real activity timestamps (applications, status
 *   changes, task submissions/comments) into calendar days — refreshing
 *   this page always reflects whatever a manager/admin most recently
 *   approved, since nothing here is cached.
 * - Achievements are computed rules over the same real data, not a stored
 *   badge collection — "locked" ones show live progress instead of a
 *   fabricated date.
 *
 * The mockup's canvas-heavy heatmap + random demo activity is replaced with
 * a plain CSS grid over the 182 real days the backend returns.
 */

const HMAP_LEGEND = ['var(--gray-100)', '#c6e48b', '#7bc96f', 'var(--forest)', 'var(--deep)'];
const RING_CIRCUMFERENCE = 264; // 2 * PI * r(42), matches the SVG below

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MyEngagement() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    apiGet('/volunteer/engagement')
      .then((d) => { setData(d); setError(''); })
      .catch((err) => setError(err.message || 'Could not load your engagement data.'))
      .finally(() => setLoading(false));
  }, []);

  const level = data?.level;
  const metrics = data?.metrics;
  const ringOffset = level ? RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * level.progressPct) / 100 : RING_CIRCUMFERENCE;

  return (
    <div className="volunteer-shell page-my-engagement">
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
            <a className="nav-item active"><span className="icon">📊</span>My Engagement</a>
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
          <div className="topbar-title">📊 My Engagement</div>
        <div className="topbar-right">
          <ProfileMenu avatarClassName="avatar" profilePath="/my-profile" />
        </div>
        </div>

        <div className="content">
          {error && <p className="form-error">{error}</p>}

          {loading || !data ? (
            <div className="empty-state"><div className="e-icon">📊</div><p>Loading your engagement data…</p></div>
          ) : (
            <>
              {/* LEVEL HERO */}
              <div className="level-hero">
                <div className="level-hero-inner">
                  <div className="level-ring-wrap">
                    <svg width="100" height="100" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="8" />
                      <circle
                        cx="50" cy="50" r="42" fill="none" stroke="#9AD14B" strokeWidth="8"
                        strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={ringOffset} strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                      />
                      <text x="50" y="46" textAnchor="middle" fontSize="18" fontWeight="800" fill="white" fontFamily="Plus Jakarta Sans">{level.hours}</text>
                      <text x="50" y="60" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,.7)" fontFamily="Plus Jakarta Sans">hrs logged</text>
                    </svg>
                  </div>
                  <div className="level-info">
                    <h2>{level.icon} {level.name}</h2>
                    <p className="level-sub">You're making a real difference. Keep going!</p>
                    <div className="level-bar-wrap">
                      {level.nextName ? (
                        <>
                          <div className="level-bar-label"><span>Progress to {level.nextName}</span><span>{level.hours}/{level.nextMinHours} hrs</span></div>
                          <div className="level-bar"><div className="level-fill" style={{ width: `${level.progressPct}%` }} /></div>
                          <div className="level-next">{level.hoursToNext} more hour{level.hoursToNext === 1 ? '' : 's'} to unlock {level.nextName} status</div>
                        </>
                      ) : (
                        <>
                          <div className="level-bar-label"><span>Top level reached</span><span>{level.hours} hrs</span></div>
                          <div className="level-bar"><div className="level-fill" style={{ width: '100%' }} /></div>
                          <div className="level-next">You've reached Sustainability Hero — the highest level!</div>
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
                          {l.name}<br /><span style={{ opacity: l.current ? 1 : 0.6 }}>{l.minHours} hrs{l.done || l.current ? ' ✓' : ''}</span>
                        </div>
                      </div>
                      {i < data.levelsPath.length - 1 && <div className={`level-connector ${l.done ? 'done' : ''}`} />}
                    </Fragment>
                  ))}
                </div>
              </div>

              {/* METRIC GRID */}
              <div className="metric-grid">
                <div className="metric-card"><div className="m-icon">⏱️</div><div className="m-num">{metrics.totalHours}</div><div className="m-label">Total Hours</div></div>
                <div className="metric-card"><div className="m-icon">✅</div><div className="m-num">{metrics.completedCount}</div><div className="m-label">Completed</div></div>
                <div className="metric-card"><div className="m-icon">📢</div><div className="m-num">{metrics.campaignsSupported}</div><div className="m-label">Campaigns Supported</div></div>
                <div className="metric-card"><div className="m-icon">🏕️</div><div className="m-num">{metrics.fieldEvents}</div><div className="m-label">Field Events</div></div>
                <div className="metric-card"><div className="m-icon">🏅</div><div className="m-num">{metrics.certificatesCount}</div><div className="m-label">Certificates</div></div>
                <div className="metric-card"><div className="m-icon">⭐</div><div className="m-num">{metrics.volunteerScore}</div><div className="m-label">Volunteer Score</div></div>
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
                  {HMAP_LEGEND.map((c) => <div className="l-cell" key={c} style={{ background: c }} />)}
                  <span>More</span>
                </div>
              </div>

              {/* SKILLS + ACHIEVEMENTS */}
              <div className="two-col">
                <div className="section-card">
                  <h3>🎯 Top Skills Used</h3>
                  {data.skills.length === 0 ? (
                    <div className="empty-state"><div className="e-icon">🎯</div><p>No completed opportunities yet.</p><div className="e-note">Skills show up here once you complete your first opportunity.</div></div>
                  ) : (
                    data.skills.map((s) => (
                      <div className="skill-bar-row" key={s.name}>
                        <span className="s-label">{s.name}</span>
                        <div className="skill-bar"><div className="skill-fill" style={{ width: `${s.pct}%` }} /></div>
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
