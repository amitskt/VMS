import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiDelete } from './api';
import './Saved.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * No mockup exists for this page (13-saved-opportunities.html was referenced
 * in the sidebar nav across the other mockups but never actually included
 * in the uploaded set) — built to match the established VolunteerShell
 * design system instead, reusing Opportunities.jsx's card language
 * (banner/tag/match-badge) so a saved Track A and Track B opportunity look
 * at home next to their un-saved counterparts elsewhere in the app.
 */

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

export default function Saved() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removingId, setRemovingId] = useState('');

  const load = () => {
    setLoading(true);
    apiGet('/volunteer/saved')
      .then((data) => { setSaved(data.saved || []); setError(''); })
      .catch((err) => setError(err.message || 'Could not load your saved opportunities.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const unsave = async (id) => {
    setRemovingId(id);
    try {
      await apiDelete(`/volunteer/saved/${id}`);
      setSaved((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      setError(err.message || 'Could not remove this opportunity.');
    } finally {
      setRemovingId('');
    }
  };

  return (
    <div className="volunteer-shell page-saved">
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
            <a className="nav-item active"><span className="icon">🔖</span>Saved</a>
          </div>
          <div className="nav-section">
            <div className="nav-section-title">Progress</div>
            <a className="nav-item" onClick={() => navigate('/my-engagement')}><span className="icon">📊</span>My Engagement</a>
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
          <div className="topbar-title">Saved Opportunities</div>
        <div className="topbar-right">
          <ProfileMenu avatarClassName="avatar" profilePath="/my-profile" />
        </div>
        </div>

        <div className="content">
          {error && <p className="form-error">{error}</p>}

          {loading ? (
            <div className="empty-state"><div className="e-icon">🔖</div><p>Loading your saved opportunities…</p></div>
          ) : saved.length === 0 ? (
            <div className="empty-state">
              <div className="e-icon">🔖</div>
              <p>Nothing saved yet.</p>
              <div className="e-note">Tap the bookmark icon on any opportunity to save it here for later.</div>
              <button className="btn-primary" style={{ marginTop: 14, maxWidth: 220 }} onClick={() => navigate('/find-opportunities')}>Find Opportunities</button>
            </div>
          ) : (
            <div className="opp-grid">
              {saved.map((o) => (
                <div className="opp-card" key={o.id}>
                  <div className={`opp-card-banner ${bannerClass(o.skills)}`} onClick={() => navigate(`/find-opportunities/${o.id}`)} />
                  <div className="opp-card-body">
                    <div className="opp-meta">
                      <span className={`opp-track ${o.track}`}>{o.isEvergreen ? '🌱 Track A' : 'Track B'}</span>
                      {!o.isEvergreen && o.matchScore != null && <div className="match-badge">{o.matchScore}%</div>}
                    </div>
                    <div className="opp-title" onClick={() => navigate(`/find-opportunities/${o.id}`)}>{o.title}</div>
                    <div className="opp-desc">{o.overview}</div>
                    {!o.isActive && <div className="opp-inactive-note">No longer accepting volunteers</div>}
                    <div className="opp-footer">
                      <span className="opp-mode">{o.mode === 'Remote' ? '🌐' : '🏞️'} {o.mode}</span>
                      <div className="opp-actions">
                        <button className="bookmark-btn saved" title="Remove from saved" onClick={() => unsave(o.id)} disabled={removingId === o.id}>
                          {removingId === o.id ? '…' : '🔖'}
                        </button>
                        <button className="view-btn" onClick={() => navigate(`/find-opportunities/${o.id}`)}>View →</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
