import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Home.css';

const REGISTER_URL = '/login';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Public landing page — no login, so no Authorization header (this hits
 * /api/public/* directly with plain fetch rather than the authenticated
 * ./volunteer/api.js helper).
 *
 * REDESIGNED to match the "STart" Figma design (ST-Planet, frame 2439-326):
 * new nav lockup, a single photo hero with an overlaid stat band, a
 * "One Community. Many Ways to STart." value-prop split section, an
 * "Open Opportunities" section with an Open Track / Application Track
 * legend, a "How It Works" numbered-steps section, and a final "Ready to
 * STart?" CTA. The footer is intentionally UNCHANGED — the design's own
 * footer frame was left as a placeholder with a note to reuse the one
 * already built here, so it's carried over as-is.
 *
 * WHAT'S REAL vs COPY: every number (hero stat band + the stats band
 * further down) and every opportunity card still comes from
 * GET /api/public/stats and /api/public/opportunities — see
 * controllers/publicController.js. Only the section headings/labels/
 * value-prop copy that came straight out of the Figma design are
 * hardcoded (no real data backs "Curiosity over credentials" the way it
 * backs "45,000+ volunteers"). Where there's genuinely nothing to show
 * yet (no active opportunity of a given track), the page shows an honest
 * empty/loading state instead of a placeholder.
 *
 * DROPPED FROM THE OLD PAGE: the "Priya S. just earned a certificate!"
 * floating card (GET /public/recent-certificate) — the new hero has no
 * slot for it and it doesn't appear anywhere in the Figma frames this
 * redesign is based on. The backend endpoint is untouched if a future
 * design brings it back.
 */

function useCountUp(target, active) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active || target == null) return;
    let raf;
    const duration = 2000;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.floor(progress * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target]);

  return value;
}

function Counter({ target, active, suffix = '' }) {
  const value = useCountUp(target, active);
  return (
    <>
      {value.toLocaleString('en-IN')}
      {suffix && <span className="stat-suffix">{suffix}</span>}
    </>
  );
}

function SaveButton() {
  const [saved, setSaved] = useState(false);
  return (
    <button
      className={`save-btn${saved ? ' saved' : ''}`}
      title="Save for later"
      onClick={(e) => {
        e.stopPropagation();
        setSaved((s) => !s);
      }}
    >
      {saved ? '🏷️' : '🔖'}
    </button>
  );
}

// Real meta lines built only from fields the Opportunity document actually
// has — no "No specific skills needed" or "Portfolio required" claims that
// aren't backed by an actual field.
function metaLines(opp) {
  const lines = [];
  const timeBit = opp.timeCommitment
    ? `${opp.timeCommitment} hrs/week`
    : opp.duration
    ? `${opp.duration} wk${opp.duration === 1 ? '' : 's'}`
    : '';
  lines.push(`📍 ${opp.mode}${timeBit ? ` · ${timeBit}` : ''}`);
  if (opp.skills?.length) lines.push(`🎯 ${opp.skills.join(', ')}`);
  if (opp.track === 'a') lines.push('🏆 Certificate auto-generated');
  else if (opp.capacity) lines.push(`👥 Limited to ${opp.capacity} spots`);
  return lines;
}

// Track A/B relabeled to the design's "Open Track" / "Application Track"
// language — same underlying data (Opportunity.track), just the copy the
// rest of the volunteer-facing app already uses under the hood.
function trackBadge(track) {
  return track === 'a'
    ? { label: 'OPEN TRACK', icon: '✓', className: 'badge-open' }
    : { label: 'APPLICATION TRACK', icon: '✦', className: 'badge-application' };
}
function trackCta(track) {
  return track === 'a' ? 'Join Instantly' : 'View & Apply';
}

// The three real numbers the hero's photo-overlay stat band shows (matches
// the design's 3-stat layout — volunteers / reach / trees). "cities" in the
// design becomes "districts" here because that's what this app actually
// tracks (Volunteer.district), never a number nobody's counted.
function buildHeroBandStats(stats) {
  if (!stats) return [];
  return [
    { target: stats.volunteersCount, suffix: '+', label: 'volunteers in our community' },
    { target: stats.districtsCovered, suffix: '', label: 'districts taking action' },
    { target: stats.treesPlanted, suffix: '+', label: 'trees nurtured together' },
  ];
}

// The fuller 4-number band further down the page (unchanged data source —
// same /public/stats call — just kept as its own section so
// certificatesIssued still has somewhere real to show up, even though the
// design's hero band only has room for 3).
function buildStatsBand(stats) {
  if (!stats) return [];
  return [
    { target: stats.treesPlanted, label: 'Trees Planted', suffix: '+' },
    { target: stats.volunteersCount, label: 'Volunteers', suffix: '+' },
    { target: stats.districtsCovered, label: 'Districts Covered', suffix: '' },
    { target: stats.certificatesIssued, label: 'Certificates Issued', suffix: '+' },
  ];
}

const HOW_IT_WORKS_STEPS = [
  { num: '01', title: 'Choose your path', text: 'Pick an open activity to join right away, or apply for a skilled role.' },
  { num: '02', title: 'Get ready', text: 'Receive a simple briefing, meet your coordinator and know what to bring.' },
  { num: '03', title: 'Create impact', text: 'Show up, contribute and see the difference your time makes.' },
];

const VALUE_PROPS = ['Curiosity over credentials', 'Commitment you can keep', 'Care for people and planet'];

export default function Home() {
  const navigate = useNavigate();

  function goToRegister() {
    navigate('/login');
  }

  // Both stat bands count up as soon as real numbers arrive from
  // GET /public/stats — no scroll-into-view gating. That gating used to
  // leave the lower stats-section reading a literal "0" for every metric
  // until a visitor scrolled it into the viewport, which looked like the
  // numbers weren't wired to the backend at all even though they were.
  const statsActive = true;

  const [stats, setStats] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [oppsLoading, setOppsLoading] = useState(true);

  // Detailed-view modal — opened by clicking any opportunity card/preview.
  // Fetches the full document (overview, what-you'll-do/learn, real
  // claimedCount/spotsLeft) from GET /public/opportunities/:id rather than
  // reusing the trimmed list-view object already in `opportunities`.
  const [detailId, setDetailId] = useState(null);
  const [detailOpp, setDetailOpp] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/public/stats`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => { /* hero/stats sections just stay empty until this resolves */ });
  }, []);

  useEffect(() => {
    setOppsLoading(true);
    fetch(`${API_BASE}/public/opportunities?limit=6`)
      .then((r) => r.json())
      .then((d) => setOpportunities(d.opportunities || []))
      .catch(() => setOpportunities([]))
      .finally(() => setOppsLoading(false));
  }, []);

  const scrollToId = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const openDetail = (id) => {
    setDetailId(id);
    setDetailOpp(null);
    setDetailError('');
    setDetailLoading(true);
    fetch(`${API_BASE}/public/opportunities/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('This opportunity is no longer available.');
        return r.json();
      })
      .then((d) => setDetailOpp(d.opportunity))
      .catch((err) => setDetailError(err.message || 'Could not load this opportunity.'))
      .finally(() => setDetailLoading(false));
  };
  const closeDetail = () => setDetailId(null);

  const heroBandStats = buildHeroBandStats(stats);
  const statsBand = buildStatsBand(stats);

  return (
    <div className="st-page">
      {/* Navigation */}
      <nav>
        <div className="nav-inner">
          <a href="#top" className="logo">
            <div className="logo-lockup">
              <span className="logo-word">STart</span>
              <span className="logo-sub">by SankalpTaru</span>
            </div>
          </a>
          <div className="nav-links">
            <a href="#community" className="nav-link">Our Community</a>
            <a href="#how-it-works" className="nav-link">How It Works</a>
            <a href="#opportunities" className="nav-link">Opportunities</a>
          </div>
          <div className="nav-actions">
            <Link to="/login" className="nav-link">Login</Link>
            <Link to="/login" className="btn-primary">Register</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero" id="top">
        <img src="/images/hero-start.jpg" alt="STart volunteers planting trees together" className="hero-img" />
        <div className="hero-content">
          <h1 className="hero-title animate-in">
            Every change needs<br />someone to <span className="accent-italic">STart</span>.
          </h1>
          <p className="hero-sub animate-in delay-1">
            STart is SankalpTaru's global volunteer community—turning care into action, one neighbourhood and one meaningful contribution at a time.
          </p>
          <div className="hero-ctas animate-in delay-2">
            <button className="btn-hero-white" onClick={goToRegister}>Find Your STart <span aria-hidden="true">→</span></button>
            <button className="btn-hero-play" onClick={() => scrollToId('how-it-works')}>
              <span className="play-circle" aria-hidden="true">▶</span> See How STart Works
            </button>
          </div>
        </div>

        {heroBandStats.length > 0 && (
          <div className="hero-stat-band">
            {heroBandStats.map((s, i) => (
              <div className="hero-band-stat" key={s.label}>
                {i > 0 && <span className="hero-band-divider" aria-hidden="true" />}
                <div className="hero-band-num">
                  <Counter target={s.target} active={statsActive} suffix={s.suffix} />
                </div>
                <div className="hero-band-label">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* One Community. Many Ways to STart. */}
      <section className="community-section" id="community">
        <div className="section-inner community-grid">
          <div className="community-left">
            <div className="eyebrow">— There's a place for you</div>
            <h2 className="community-title">
              One Community.<br /><span className="accent-green">Many Ways to STart.</span>
            </h2>
          </div>
          <div className="community-right">
            <p className="community-text">
              STart brings together doers—students, professionals, nature lovers and neighbourhood champions who believe small, steady actions can reshape our planet.
            </p>
            <div className="value-grid">
              {VALUE_PROPS.map((v) => (
                <div className="value-item" key={v}>
                  <span className="check-dot" aria-hidden="true">✓</span>{v}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Live Opportunities */}
      <section className="opps-section" id="opportunities">
        <div className="section-inner">
          <div className="eyebrow">— Find your way in</div>
          <h2 className="section-title">Open Opportunities</h2>

          <div className="track-legend">
            <div className="track-legend-item">
              <span className="legend-icon legend-open" aria-hidden="true">✓</span>
              <div>
                <strong>Open Track</strong>
                <p>Join instantly. No application or screening.</p>
              </div>
            </div>
            <div className="track-legend-item">
              <span className="legend-icon legend-application" aria-hidden="true">✦</span>
              <div>
                <strong>Application Track</strong>
                <p>Tell us about yourself. We'll review your fit.</p>
              </div>
            </div>
          </div>

          {oppsLoading ? (
            <p className="opps-empty">Loading opportunities…</p>
          ) : opportunities.length === 0 ? (
            <p className="opps-empty">No open opportunities right now — check back soon!</p>
          ) : (
            <div className="opps-strip">
              {opportunities.map((opp) => {
                const badge = trackBadge(opp.track);
                return (
                  <div className="opp-card" key={opp.id} onClick={() => openDetail(opp.id)}>
                    <SaveButton />
                    <div className="opp-card-top">
                      <span className={`track-badge ${badge.className}`}>
                        <span aria-hidden="true">{badge.icon}</span> {badge.label}
                      </span>
                      <span className="opp-external" aria-hidden="true">↗</span>
                    </div>
                    <h3 className="opp-title">{opp.title}</h3>
                    <div className="opp-meta">
                      {metaLines(opp).map((line) => <span key={line}>{line}</span>)}
                    </div>
                    {opp.overview && <p className="opp-desc">{opp.overview}</p>}
                    <div className="opp-footer">
                      <span className="opp-claim-count">{opp.claimedCount.toLocaleString('en-IN')} claimed</span>
                      <button
                        className="opp-cta-link"
                        onClick={(e) => { e.stopPropagation(); goToRegister(); }}
                      >
                        {trackCta(opp.track)} <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="opps-view-all">
            <a href={REGISTER_URL} className="btn-view-all">View All Opportunities <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </section>

      {/* Stats band — same real numbers as the hero, plus Certificates
          Issued, which the hero's 3-slot band has no room for. */}
      {statsBand.length > 0 && (
        <section className="stats-section">
          <div className="stats-grid">
            {statsBand.map((s) => (
              <div key={s.label}>
                <div className="stat-num">
                  <Counter target={s.target} active={statsActive} suffix={s.suffix} />
                </div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* How It Works */}
      <section className="how-section" id="how-it-works">
        <div className="section-inner how-grid">
          <div className="how-left">
            <div className="eyebrow eyebrow-gold">— Simple by design</div>
            <h2 className="how-title">
              From "I want to help"<br />to <span className="accent-gold">"I made a difference."</span>
            </h2>
          </div>
          <div className="how-right">
            {HOW_IT_WORKS_STEPS.map((step) => (
              <div className="how-step" key={step.num}>
                <span className="how-num">{step.num}</span>
                <div className="how-step-body">
                  <h4>{step.title}</h4>
                  <p>{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="final-cta">
        <div className="eyebrow" style={{ textAlign: 'center' }}>— Every change begins somewhere</div>
        <h2 className="final-cta-title">Ready to <span className="accent-green">STart</span>?</h2>
        <p className="final-cta-sub">Give your time, share your skills and grow change with us.</p>
        <div className="final-cta-actions">
          <button className="btn-cta-primary" onClick={goToRegister}>Join STart <span aria-hidden="true">→</span></button>
          <span className="already-text">Already part of STart? <Link to="/login">Log in</Link></span>
        </div>
      </section>

      {/* FOOTER — unchanged, reused as-is (the design's own footer frame was
          left blank with a note to keep the one already built here). */}
      <footer>
        <p style={{ marginBottom: 8, color: 'rgba(255,255,255,.6)', fontWeight: 600 }}>SankalpTaru Foundation</p>
        <p>
          © 2026 SankalpTaru Foundation. All rights reserved. |{' '}
          <a href="#" style={{ color: 'var(--lime)' }}>Privacy Policy</a> |{' '}
          <a href="#" style={{ color: 'var(--lime)' }}>Volunteer Guidelines</a>
        </p>
      </footer>

      {/* Opportunity detail modal — opened by clicking any card above.
          Real data only: GET /public/opportunities/:id, no fabricated
          copy filled in while loading or on error.
      */}
      {detailId && (
        <div className="opp-modal-overlay" onClick={closeDetail}>
          <div className="opp-modal" onClick={(e) => e.stopPropagation()}>
            <button className="opp-modal-close" onClick={closeDetail} aria-label="Close">✕</button>

            {detailLoading ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '48px 0' }}>Loading…</p>
            ) : detailError ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '48px 0' }}>{detailError}</p>
            ) : detailOpp ? (
              <>
                {(() => {
                  const badge = trackBadge(detailOpp.track);
                  return (
                    <span className={`track-badge ${badge.className}`}>
                      <span aria-hidden="true">{badge.icon}</span> {badge.label}
                    </span>
                  );
                })()}
                <h2 className="opp-modal-title">{detailOpp.title}</h2>
                <div className="opp-meta opp-modal-meta">
                  {metaLines(detailOpp).map((line) => <span key={line}>{line}</span>)}
                </div>

                {detailOpp.overview && <p className="opp-modal-text">{detailOpp.overview}</p>}

                {detailOpp.whatYouWillDo && (
                  <div className="opp-modal-block">
                    <h4>What You'll Do</h4>
                    <p>{detailOpp.whatYouWillDo}</p>
                  </div>
                )}

                {detailOpp.whatYouWillLearn && (
                  <div className="opp-modal-block">
                    <h4>What You'll Learn</h4>
                    <p>{detailOpp.whatYouWillLearn}</p>
                  </div>
                )}

                <div className="opp-modal-footer">
                  <span className="opp-claim-count">
                    {detailOpp.track === 'a'
                      ? `${detailOpp.claimedCount.toLocaleString('en-IN')} volunteer${detailOpp.claimedCount === 1 ? '' : 's'} claimed this`
                      : `${detailOpp.claimedCount.toLocaleString('en-IN')} applied${detailOpp.spotsLeft != null ? ` · ${detailOpp.spotsLeft} spot${detailOpp.spotsLeft === 1 ? '' : 's'} left` : ''}`}
                  </span>
                  <button className="opp-cta-link" onClick={goToRegister}>
                    {trackCta(detailOpp.track)} <span aria-hidden="true">→</span>
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
