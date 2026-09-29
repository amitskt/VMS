import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from './api';
import './Certificates.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * My Certificates (15-my-certificates.html) — earned certificates (Track A
 * submissions and approved Track B tasks both set Application.
 * certificateIssued, see volunteerCertificateController.js's file header)
 * plus a pending state for Track B work that's been submitted but not yet
 * approved.
 *
 * Adapted from the mockup:
 * - "Download PDF" is real (streams from GET /certificates/:id/pdf as an
 *   authenticated blob download) — the mockup's button was a plain
 *   `alert('Certificate download started!')`.
 * - "Share on LinkedIn" opens a real LinkedIn share-intent for the actual
 *   certificate — specifically its Drive PDF link (Application.
 *   certificateDriveUrl, "anyone with the link can view", exposed to the
 *   frontend via views/certificateView.js's toPublicCertificate), not the
 *   mockup's fictional per-certificate verify page
 *   (sankalptaru.org/verify/<id> is still just text printed on the
 *   certificate itself — see certDate below — it isn't a route that exists
 *   anywhere yet, so it can't be shared as a working link). Falls back to
 *   sankalptaru.org's homepage for the rare certificate that has no
 *   certificateDriveUrl yet (issued before this field existed, or its
 *   Drive upload failed — see certificateData.js's uploadCertificateToDrive).
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function downloadPdf(applicationId, certificateId) {
  const res = await fetch(`${BASE_URL}/volunteer/certificates/${applicationId}/pdf`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('st_token')}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Could not download this certificate.');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${certificateId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default function Certificates() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [earned, setEarned] = useState([]);
  const [pending, setPending] = useState([]);
  const [summary, setSummary] = useState({ earned: 0, pending: 0, downloadable: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [viewTarget, setViewTarget] = useState(null);
  const [downloadingId, setDownloadingId] = useState('');
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    apiGet('/volunteer/certificates')
      .then((data) => {
        setEarned(data.earned || []);
        setPending(data.pending || []);
        setSummary(data.summary || { earned: 0, pending: 0, downloadable: 0 });
        setError('');
      })
      .catch((err) => setError(err.message || 'Could not load your certificates.'))
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (cert) => {
    setDownloadingId(cert.applicationId);
    setDownloadError('');
    try {
      await downloadPdf(cert.applicationId, cert.certificateId);
    } catch (err) {
      setDownloadError(err.message);
    } finally {
      setDownloadingId('');
    }
  };

  const shareOnLinkedIn = (certificateUrl) => {
    // Prefer the actual certificate's public Drive link so the share is
    // specific to what was earned, not just the org's homepage — see the
    // file header comment above for why certificateUrl can be missing.
    const url = certificateUrl || 'https://sankalptaru.org';
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="volunteer-shell page-certificates">
      {viewTarget && (
        <div className="modal-overlay open">
          <div className="cert-modal">
            <div className="cert-modal-visual">
              <div className="medal">🏅</div>
              <h2>{viewTarget.type}</h2>
              <h1>{viewTarget.volunteerName}</h1>
              <p>has successfully completed</p>
              <p><strong style={{ color: 'white' }}>{viewTarget.opportunityTitle}</strong></p>
              <div className="cert-date-lg">Issued: {formatDate(viewTarget.issuedAt)}</div>
              <div className="cert-id-lg">ID: {viewTarget.certificateId}</div>
            </div>
            <div className="cert-modal-body">
              {downloadError && <p className="form-error">{downloadError}</p>}
              <div className="modal-actions">
                <button className="ma-btn ma-dl" disabled={downloadingId === viewTarget.applicationId} onClick={() => handleDownload(viewTarget)}>
                  {downloadingId === viewTarget.applicationId ? 'Preparing…' : '⬇ Download PDF'}
                </button>
                <button className="ma-btn ma-li" onClick={() => shareOnLinkedIn(viewTarget.certificateDriveUrl)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }}><path d="M19 3a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14m-.5 15.5v-5.3a3.26 3.26 0 00-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 011.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 001.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 00-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" /></svg>
                  Share on LinkedIn
                </button>
                <button className="ma-btn ma-close" onClick={() => setViewTarget(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo"><div className="logo-wrap"><div className="logo-lockup">
              <span className="logo-word">STart</span>
              <span className="logo-sub">by SankalpTaru</span>
            </div></div></div>
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
            <a className="nav-item active"><span className="icon">🏅</span>Certificates</a>
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
          <div className="topbar-title">🏅 My Certificates</div>
        <div className="topbar-right">
          <ProfileMenu avatarClassName="avatar" profilePath="/my-profile" />
        </div>
        </div>

        <div className="content">
          {error && <p className="form-error">{error}</p>}

          <div className="summary-strip">
            <div className="summary-tile"><div className="st-num">{summary.earned}</div><div className="st-label">Earned</div></div>
            <div className="summary-tile"><div className="st-num">{summary.pending}</div><div className="st-label">Pending</div></div>
            <div className="summary-tile"><div className="st-num">{summary.downloadable}</div><div className="st-label">Downloadable</div></div>
          </div>

          {loading ? (
            <div className="empty-state"><div className="e-icon">🏅</div><p>Loading your certificates…</p></div>
          ) : earned.length === 0 && pending.length === 0 ? (
            <div className="empty-state">
              <div className="e-icon">🏅</div>
              <p>No certificates yet.</p>
              <div className="e-note">Complete a Track A opportunity or an assigned Track B task to earn your first one.</div>
              <button className="btn-primary" style={{ marginTop: 14, maxWidth: 220 }} onClick={() => navigate('/find-opportunities')}>Find Opportunities</button>
            </div>
          ) : (
            <div className="cert-grid">
              {earned.map((c) => (
                <div className="cert-card" key={c.applicationId} onClick={() => setViewTarget(c)}>
                  <div className="cert-visual">
                    <div className="cv-header">
                      <div className="cv-logo">{c.track === 'a' ? '🌱' : '🌳'}</div>
                      <span className="cv-org">SankalpTaru Foundation</span>
                    </div>
                    <h3>Certificate of Participation</h3>
                    <p className="cv-name">{c.volunteerName}</p>
                    <span className="cv-badge">{c.track === 'a' ? 'Track A' : 'Track B'} · {c.opportunityTitle}</span>
                  </div>
                  <div className="cert-body">
                    <div className="cert-id-row">
                      <span className="cert-id-label">Certificate ID</span>
                      <span
                        className="cert-id-code"
                        title="Click to copy"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(c.certificateId);
                          const el = e.currentTarget;
                          const original = c.certificateId;
                          el.textContent = 'Copied!';
                          setTimeout(() => { el.textContent = original; }, 1500);
                        }}
                      >
                        {c.certificateId}
                      </span>
                    </div>
                    <div className="cert-date">Issued: {formatDate(c.issuedAt)} · Verify at sankalptaru.org/verify/{c.certificateId}</div>
                    <div className="cert-actions">
                      <button className="ca-btn ca-view" onClick={(e) => { e.stopPropagation(); setViewTarget(c); }}>👁 View</button>
                      <button className="ca-btn ca-download" disabled={downloadingId === c.applicationId} onClick={(e) => { e.stopPropagation(); handleDownload(c); }}>
                        {downloadingId === c.applicationId ? '…' : '⬇ PDF'}
                      </button>
                      <button className="ca-btn ca-linkedin" onClick={(e) => { e.stopPropagation(); shareOnLinkedIn(c.certificateDriveUrl); }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14m-.5 15.5v-5.3a3.26 3.26 0 00-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 011.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 001.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 00-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" /></svg>
                        Share
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {pending.map((p, i) => (
                <div className="cert-card cert-pending" key={`pending-${i}`}>
                  <div className="cert-visual">
                    <div className="cv-header">
                      <div className="cv-logo" style={{ background: 'rgba(255,255,255,.2)' }}>⏳</div>
                      <span className="cv-org">Pending Review</span>
                    </div>
                    <h3>Certificate of Participation</h3>
                    <span className="cv-badge" style={{ background: 'rgba(255,255,255,.15)', color: 'rgba(255,255,255,.6)', borderColor: 'rgba(255,255,255,.2)' }}>Track B · {p.opportunityTitle}</span>
                  </div>
                  <div className="pending-label">
                    ⏳ Certificate pending manager approval
                    <span>Will be issued once your submitted work is approved by the coordinator.</span>
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
