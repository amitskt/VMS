import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost, apiDelete } from './api';
import './Opportunities.css';

/**
 * Converted from 05-recommended-opportunities.html, wired to the real
 * backend (controllers/volunteerOpportunityController.js) — Track B
 * opportunities are Gemini-matched and ranked (utils/geminiMatcher.js),
 * Track A ("Always Open") opportunities are shown as-is, no matching
 * needed. See OpportunityDetail.jsx for what "View" opens.
 *
 * Adapted from the mockup rather than copied 1:1 in a couple of places:
 * - The mockup's filter chips (Remote/Field/Writing/Design/Tech) were
 *   cosmetic categories that don't map to this app's real Mode/Skill enums,
 *   so filtering here uses the real values from GET /opportunities/meta.
 * - The mockup's evergreen strip mixed a Track B example into "Always
 *   Open" — but Track B always requires manager review in this app's real
 *   rules (see opportunityController.js), so only real Track A
 *   opportunities are shown there.
 * - Bookmarking now persists via GET/POST/DELETE /volunteer/saved (see
 *   Saved.jsx and volunteerSavedController.js) — the saved set is loaded
 *   once on mount and kept in sync as the volunteer toggles bookmarks here.
 */

const PAGE_SIZE = 9;

const BANNER_BY_SKILL = {
  'Content & Communication': 'write',
  'Design & Creative': 'design',
  'Digital, Tech & Data': 'tech',
  'Research & Documentation': 'tech',
  'Education & Training': 'write',
  'Field & Community Support': 'field',
  'Outreach & Partnerships': 'field',
  'Landscape & Sustainability': 'field',
};
function bannerClass(skills) {
  return BANNER_BY_SKILL[skills?.[0]] || '';
}

export default function Opportunities() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [meta, setMeta] = useState({ skills: [], modes: [] });
  const [evergreen, setEvergreen] = useState([]);

  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const [skillFilter, setSkillFilter] = useState('all');
  const [sort, setSort] = useState('match');

  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [saved, setSaved] = useState(() => new Set());

  useEffect(() => {
    apiGet('/volunteer/opportunities/meta').then(setMeta).catch(() => {
      /* non-fatal — filter dropdowns just stay empty if this fails */
    });
    apiGet('/volunteer/saved')
      .then((data) => setSaved(new Set((data.saved || []).map((o) => o.id))))
      .catch(() => {
        /* non-fatal — bookmarks just show as un-saved if this fails */
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      sort,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(modeFilter !== 'all' ? { mode: modeFilter } : {}),
      ...(skillFilter !== 'all' ? { skill: skillFilter } : {}),
    });

    // Small debounce so fast typing doesn't fire a request per keystroke —
    // same pattern as the admin side's Volunteers.jsx / Opportunities.jsx.
    const timeoutId = setTimeout(() => {
      apiGet(`/volunteer/opportunities?${query.toString()}`)
        .then((data) => {
          setEvergreen(data.evergreen || []);
          setOpportunities(data.opportunities || []);
          setTotalPages(data.pages || 1);
          setTotal(data.total || 0);
          setError('');
        })
        .catch((err) => setError(err.message || 'Could not load opportunities.'))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search, modeFilter, skillFilter, sort, page]);

  const clearFilters = () => {
    setSearch('');
    setModeFilter('all');
    setSkillFilter('all');
    setPage(1);
  };

  const toggleSaved = async (id) => {
    const wasSaved = saved.has(id);
    // Optimistic update — the bookmark icon flips immediately; rolled back
    // below if the request fails.
    setSaved((prev) => {
      const next = new Set(prev);
      wasSaved ? next.delete(id) : next.add(id);
      return next;
    });
    try {
      if (wasSaved) await apiDelete(`/volunteer/saved/${id}`);
      else await apiPost(`/volunteer/saved/${id}`);
    } catch {
      setSaved((prev) => {
        const next = new Set(prev);
        wasSaved ? next.add(id) : next.delete(id);
        return next;
      });
    }
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="volunteer-shell page-opportunities">
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
            <a className="nav-item" onClick={() => navigate('/dashboard')}>
              <span className="icon">🏠</span>Dashboard
            </a>
            <a className="nav-item active">
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
      </aside>
      <div className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* MAIN */}
      <div className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search opportunities by title or keyword…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select className="sort-select" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            <option value="match">Sort: Best Match</option>
            <option value="newest">Newest First</option>
            <option value="alpha">A → Z</option>
          </select>
        </div>

        <div className="content">
          {evergreen.length > 0 && (
            <>
              <div className="section-title">
                🌿 Always Open <span className="evergreen-badge">EVERGREEN</span>
              </div>
              <div className="evergreen-strip">
                {evergreen.map((o) => (
                  <div className="evergreen-card" key={o.id} onClick={() => navigate(`/find-opportunities/${o.id}`)}>
                    <span className="track-chip">Track A · Auto-Approve</span>
                    <h4>{o.title}</h4>
                    <p>{o.overview}</p>
                    <div className="card-footer">
                      <button className="apply-btn" onClick={(e) => { e.stopPropagation(); navigate(`/find-opportunities/${o.id}`); }}>
                        View Details →
                      </button>
                      <span className="always-open"><span className="green-dot" />Always accepting</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="filter-row">
            <button className={`filter-chip ${modeFilter === 'all' ? 'active' : ''}`} onClick={() => { setModeFilter('all'); setPage(1); }}>All</button>
            {meta.modes.map((m) => (
              <button key={m} className={`filter-chip ${modeFilter === m ? 'active' : ''}`} onClick={() => { setModeFilter(m); setPage(1); }}>{m}</button>
            ))}
            <select className="sort-select" value={skillFilter} onChange={(e) => { setSkillFilter(e.target.value); setPage(1); }}>
              <option value="all">All Skills</option>
              {meta.skills.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <span className="results-count">Showing {rangeStart}–{rangeEnd} of {total} opportunities</span>
          </div>

          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="empty-state">
              <div className="e-icon">🎯</div>
              <p>Finding your best matches…</p>
            </div>
          ) : opportunities.length === 0 ? (
            <div className="empty-state">
              <div className="e-icon">🪴</div>
              <p>No matching opportunities.</p>
              <div className="e-note">Try broadening your search or clearing the filters.</div>
              <button className="btn-ghost" style={{ marginTop: 14 }} onClick={clearFilters}>Clear All Filters</button>
            </div>
          ) : (
            <>
              <div className="opp-grid">
                {opportunities.map((o) => (
                  <div className={`opp-card ${o.isFull ? 'is-full' : ''}`} key={o.id} onClick={() => navigate(`/find-opportunities/${o.id}`)}>
                    <div className={`opp-card-banner ${bannerClass(o.skills)}`} />
                    <div className="opp-card-body">
                      <div className="opp-meta">
                        <span className="opp-track b">Track B</span>
                        {o.isFull ? (
                          <div className="full-badge">Full</div>
                        ) : (
                          <div className="match-badge">
                            {o.matchScore}%
                            {o.matchReasons?.[0] && <div className="match-tooltip">{o.matchReasons[0]}</div>}
                          </div>
                        )}
                      </div>
                      <div className="opp-title">{o.title}</div>
                      <div className="opp-desc">{o.overview}</div>
                      <div className="opp-tags">
                        {o.skills.slice(0, 3).map((s) => <span className="opp-tag" key={s}>{s}</span>)}
                        {o.skills.length > 3 && <span className="opp-tag">+{o.skills.length - 3} more</span>}
                      </div>
                      <div className="opp-footer">
                        <span className="opp-mode">
                          {o.mode === 'Remote' ? '🌐' : '🏞️'} {o.mode} ·{' '}
                          {o.timeCommitment ? `${o.timeCommitment} hrs/week` : o.duration ? `${o.duration} wk${o.duration === 1 ? '' : 's'}` : 'Flexible'}
                        </span>
                        <div className="opp-actions">
                          <button
                            className={`bookmark-btn ${saved.has(o.id) ? 'saved' : ''}`}
                            title="Save for later"
                            onClick={(e) => { e.stopPropagation(); toggleSaved(o.id); }}
                          >
                            🔖
                          </button>
                          <button className="view-btn" onClick={(e) => { e.stopPropagation(); navigate(`/find-opportunities/${o.id}`); }}>
                            View →
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pagination">
                <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
                <button className="page-btn active">{page}</button>
                <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
