import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiPost } from './api';
import './ClaimTrackA.css';

/**
 * Converted from 07-track-a-claim.html, wired to the real backend
 * (POST /volunteer/applications). Standalone full-page flow, no sidebar —
 * matches the mockup's own centered page-wrap layout rather than the
 * dashboard shell.
 *
 * Adapted from the mockup:
 * - The certificate-preview teaser and its blur/reveal-on-photo-select
 *   effect were purely cosmetic flourish with no real certificate template
 *   behind them yet, so it's dropped rather than faked.
 * - The mockup lets you attach the tree photo right here, but per the real
 *   Requirements rule elsewhere in this app ("Track A: auto-approved,
 *   certificate on submission"), the photo + story is the actual submission
 *   step, not part of claiming — claiming just reserves the spot. That
 *   submission step lives on MyApplications.jsx instead (there's no
 *   My Tasks page yet for it to live on, as the mockup originally intended).
 * - The mockup's canvas confetti animation is dropped here (a nice-to-have,
 *   not core to the flow) in favor of a simpler success overlay — the same
 *   celebratory moment lives more fully on Confirmation.jsx instead, which
 *   is where the volunteer actually lands after this.
 */
export default function ClaimTrackA() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [opp, setOpp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [city, setCity] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [species, setSpecies] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    apiGet(`/volunteer/opportunities/${id}`)
      .then((data) => setOpp(data.opportunity))
      .catch((err) => setError(err.message || 'Could not load this opportunity.'))
      .finally(() => setLoading(false));
  }, [id]);

  const confirmClaim = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const { application } = await apiPost('/volunteer/applications', {
        opportunityId: id,
        claimDetails: { city, plannedDate: plannedDate || undefined, species },
      });
      setClaimed(true);
      setTimeout(() => navigate(`/confirmation/${application.id}`), 1600);
    } catch (err) {
      setSubmitError(err.message || 'Could not claim this opportunity.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-claim-a">
        <div className="page-wrap">
          <p style={{ textAlign: 'center', color: 'var(--gray-400)' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (error || !opp) {
    return (
      <div className="page-claim-a">
        <div className="page-wrap">
          <p style={{ textAlign: 'center', color: 'var(--gray-600)' }}>{error || 'Opportunity not found.'}</p>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button className="back-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => navigate('/find-opportunities')}>
              ← Back to Opportunities
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-claim-a">
      {claimed && (
        <div className="success-overlay">
          <div className="success-card">
            <div className="success-icon">🎉</div>
            <h2>You're all set!</h2>
            <p>Your {opp.title} claim has been registered. Taking you to your confirmation…</p>
            <div className="success-chips">
              <span className="s-chip green">✓ Claimed</span>
              <span className="s-chip gold">🏅 Certificate Pending Submission</span>
            </div>
          </div>
        </div>
      )}

      <div className="page-wrap">
        <a className="back-link" onClick={() => navigate(`/find-opportunities/${id}`)}>← Back to Opportunity</a>

        <div className="info-banner">
          <div className="b-icon">⚡</div>
          <div>
            <h3>No waiting — this is an auto-approve opportunity!</h3>
            <p>
              {opp.title} (Track A) is open to all volunteers. Confirm your claim now, then submit your proof of
              work at any time from My Applications to receive your instant digital certificate.
            </p>
            <div className="instant-chips">
              <span className="instant-chip">✓ No review needed</span>
              <span className="instant-chip">🏅 Instant certificate</span>
              <span className="instant-chip">🌿 Open to all</span>
            </div>
          </div>
        </div>

        <div className="form-card">
          <h2>Confirm Your Claim</h2>
          <p className="subtitle">Fill in a few optional details to register your participation. You can submit your proof of work later.</p>

          <div className="form-grid-2">
            <div className="field-group">
              <label>City <span className="opt">(optional)</span></label>
              <input type="text" placeholder="e.g. Bengaluru" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="field-group">
              <label>Planned Date <span className="opt">(optional)</span></label>
              <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
            </div>
          </div>

          <div className="field-group">
            <label>Notes <span className="opt">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. species you plan to plant, or any other detail"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
            />
          </div>
        </div>

        {submitError && <p className="form-error">{submitError}</p>}

        <div className="confirm-section">
          <button className="btn-confirm" disabled={submitting} onClick={confirmClaim}>
            {submitting ? '✓ Claiming…' : '🌱 Confirm My Claim'}
          </button>
          <p className="confirm-hint">You can submit your proof of work at any time from My Applications. Your spot is reserved.</p>
        </div>
      </div>
    </div>
  );
}
