import { useEffect, useState } from 'react';
import './Certificates.css';
import ProfileMenu from '../../components/ProfileMenu.jsx';

/**
 * Certificates log (Super Admin + Department Heads) — converted from
 * admin-10-certificates.html. Same department-scoping and auth pattern as
 * Applications.jsx / TaskBoard.jsx: a manager only ever sees certificates
 * for opportunities their own department owns, resolved server-side (see
 * adminCertificateController.js), never trusted from here.
 *
 * Adapted from the mockup:
 * - There's no separate Certificate model — every row here is really an
 *   Application with certificateIssued: true (see
 *   adminCertificateController.js's file header). The table/filters/modal
 *   below are otherwise a direct translation of the mockup.
 * - The mockup's "Type" filter (Track A/B Completion, Campaign
 *   Participation, Field Volunteering, Special Recognition) is dropped —
 *   nothing in this app issues those other categories, and Type is always
 *   1:1 with Track here, so it would just duplicate the Track filter.
 * - "Download PDF" is real (streams from GET /certificates/:id/pdf) —
 *   the mockup had no download behind its button at all.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/admin';
const PAGE_SIZE = 10;

async function apiRequest(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('st_token')}`,
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

async function downloadPdf(applicationId, certificateId) {
  const res = await fetch(`${BASE_URL}/certificates/${applicationId}/pdf`, {
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

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const ROLE_SHELL = {
  super: { userName: 'Apurva', userRole: 'Super Admin', avatarInitial: 'A', roleChip: 'Super Admin · All Departments', showAdminSection: true },
  head: { userName: 'Amit', userRole: 'Department Head · Programs', avatarInitial: 'V', roleChip: 'Department Head · Programs', showAdminSection: false },
};

export default function Certificates() {
  const isAdmin = localStorage.getItem('st_role') === 'admin';
  const [role] = useState(isAdmin ? 'super' : 'head');
  const shell = ROLE_SHELL[role];

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [meta, setMeta] = useState({ departments: [], myDepartment: null });
  const [search, setSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [viewTarget, setViewTarget] = useState(null);
  const [downloadingId, setDownloadingId] = useState('');
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    apiRequest('/certificates/meta').then(setMeta).catch(() => {
      /* non-fatal — filter dropdown just stays empty if this fails */
    });
  }, []);

  const load = () => {
    setLoading(true);
    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(trackFilter !== 'all' ? { track: trackFilter } : {}),
      ...(deptFilter !== 'all' ? { department: deptFilter } : {}),
    });
    const timeoutId = setTimeout(() => {
      apiRequest(`/certificates?${query.toString()}`)
        .then((data) => {
          setCertificates(data.certificates);
          setTotalPages(data.pages);
          setTotal(data.total);
          setError('');
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeoutId);
  };

  useEffect(load, [search, trackFilter, deptFilter, page]);

  const clearFilters = () => {
    setSearch('');
    setTrackFilter('all');
    setDeptFilter('all');
    setPage(1);
  };

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

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="dash-page page-certificates">
      {viewTarget && (
        <div className="modal-overlay show">
          <div className="modal-box">
            <div className="cert-card">
              <div className="cert-inner">
                <div className="cert-header">
                  <div className="cert-logo">🌳</div>
                  <span className="cert-org">SankalpTaru Foundation</span>
                </div>
                <h3>Certificate of Participation</h3>
                <p className="cert-name">{viewTarget.volunteerName}</p>
                <div className="cert-date">{viewTarget.opportunityTitle} · {formatDate(viewTarget.issuedAt)}</div>
                <span className="cert-badge">{viewTarget.type}</span>
              </div>
            </div>
            <div className="cert-id">ID: {viewTarget.certificateId} · verify at sankalptaru.org/verify/{viewTarget.certificateId}</div>
            {downloadError && <p className="form-error" style={{ marginTop: 14 }}>{downloadError}</p>}
            <div className="modal-actions" style={{ marginTop: 18 }}>
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }} disabled={downloadingId === viewTarget.applicationId} onClick={() => handleDownload(viewTarget)}>
                {downloadingId === viewTarget.applicationId ? 'Preparing…' : '⬇ Download PDF'}
              </button>
              <button className="btn-ghost" style={{ width: '100%' }} onClick={() => setViewTarget(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

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
            <a className="nav-item" href="/admin-dashboard"><span className="icon">🏠</span>Dashboard</a>
          </div>
          <div className="nav-section">
            <div className="nav-section-title">Opportunities</div>
            <a className="nav-item" href="/opportunities"><span className="icon">🌱</span>Opportunities</a>
            <a className="nav-item" href="/applications"><span className="icon">📋</span>Applications</a>
            <a className="nav-item" href="/task-board"><span className="icon">🗂️</span>Task Board</a>
          </div>
          <div className="nav-section">
            <div className="nav-section-title">Volunteers</div>
            <a className="nav-item" href="/volunteers"><span className="icon">👥</span>Volunteers</a>
            <a className="nav-item active" href="/certificates"><span className="icon">🏅</span>Certificates</a>
          </div>
          {shell.showAdminSection && (
            <div className="nav-section">
              <div className="nav-section-title">Administration</div>
              <a className="nav-item" href="/departments"><span className="icon">🏢</span>Departments</a>
              <a className="nav-item" href="/settings"><span className="icon">⚙️</span>Settings</a>
            </div>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="avatar">{shell.avatarInitial}</div>
            <div className="user-info"><div className="name">{shell.userName}</div><div className="role">{shell.userRole}</div></div>
          </div>
        </div>
      </aside>

      <div className={`sidebar-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
          <div className="topbar-title">Certificates</div>
          <div className="topbar-right">
            <span className="topbar-role-chip">{shell.roleChip}</span>
            <ProfileMenu avatarInitial={shell.avatarInitial} avatarClassName="avatar avatar--sm" profilePath="/profile" />
          </div>
        </div>

        <div className="content">
          <div className="page-head">
            <div>
              <h1>Certificates</h1>
              <p>Log of certificates issued from Track A submissions and approved Track B tasks</p>
            </div>
          </div>

          <div className="section-card">
            <div className="filter-bar">
              <div className="search-wrap">
                <span className="s-icon">🔍</span>
                <input type="text" placeholder="Search by volunteer or certificate ID…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <select className="filter-select" value={trackFilter} onChange={(e) => { setTrackFilter(e.target.value); setPage(1); }}>
                <option value="all">All Tracks</option>
                <option value="a">Track A</option>
                <option value="b">Track B</option>
              </select>
              {!meta.myDepartment && (
                <select className="filter-select" value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}>
                  <option value="all">All Departments</option>
                  {meta.departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
            </div>
            {meta.myDepartment && (
              <div className="filter-note">Showing certificates for opportunities owned by <strong>{meta.myDepartment}</strong></div>
            )}

            {error && <p className="form-error">{error}</p>}

            {loading ? (
              <div className="loading-state">
                <div className="skeleton skel-row" />
                <div className="skeleton skel-row" />
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Certificate ID</th>
                      <th>Volunteer</th>
                      <th>Opportunity</th>
                      <th>Track</th>
                      <th>Type</th>
                      <th>Date Issued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certificates.map((c) => (
                      <tr key={c.applicationId} style={{ cursor: 'pointer' }} onClick={() => setViewTarget(c)}>
                        <td data-label="Certificate ID">{c.certificateId}</td>
                        <td data-label="Volunteer"><strong>{c.volunteerName}</strong></td>
                        <td data-label="Opportunity">{c.opportunityTitle}</td>
                        <td data-label="Track"><span className={`track-chip ${c.track === 'a' ? 'track-a' : 'track-b'}`}>{c.track === 'a' ? 'Track A' : 'Track B'}</span></td>
                        <td data-label="Type">{c.type}</td>
                        <td data-label="Date Issued">{formatDate(c.issuedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {certificates.length === 0 && (
                  <div className="zero-state show">
                    <div className="zs-icon">🏅</div>
                    <h3>No certificates match your filters</h3>
                    <p>Try a different search term or clear the filters.</p>
                    <div className="zs-btns"><button className="btn-ghost" onClick={clearFilters}>Clear All Filters</button></div>
                  </div>
                )}

                {certificates.length > 0 && (
                  <div className="pagination">
                    <div className="p-info">Showing {rangeStart}–{rangeEnd} of {total}</div>
                    <div className="p-controls">
                      <button className="p-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
                      <button className="p-btn active">{page}</button>
                      <button className="p-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
