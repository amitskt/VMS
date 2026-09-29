import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiPost } from './api';
import './ApplyTrackB.css';

/**
 * Converted from 08-track-b-express-interest.html, wired to the real
 * backend (POST /volunteer/applications). Standalone full-page flow, no
 * sidebar — matches the mockup's own layout.
 *
 * Adapted from the mockup:
 * - Work-sample file uploads are dropped. This project has no file-storage
 *   backend (Profile.jsx's photo is the one exception, stored as a base64
 *   data URL directly on the volunteer document) and multiple attachments
 *   at 20MB each would be a poor fit for that pattern. The Portfolio/
 *   LinkedIn URL field covers the same "show me your work" need without it.
 * - The 5–7 business day estimate in the mockup's header/next-steps text is
 *   presentational copy, not a real SLA the backend tracks — kept as-is
 *   since it's just messaging.
 */

const MIN_MOTIVATION = 80;
const MAX_MOTIVATION = 600;

const START_OPTIONS = [
  { value: 'immediate', title: 'Immediately', sub: 'Ready to begin within the next week' },
  { value: '2weeks', title: 'In 2 Weeks', sub: 'Need a couple of weeks to get ready' },
  { value: '1month', title: 'In 1 Month', sub: 'Can commit starting next month' },
  { value: 'flexible', title: 'Flexible — coordinator can decide', sub: "I'm open to whenever works best for the team" },
];

export default function ApplyTrackB() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [opp, setOpp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [motivation, setMotivation] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [startAvailability, setStartAvailability] = useState('2weeks');
  const [motivationErr, setMotivationErr] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    apiGet(`/volunteer/opportunities/${id}`)
      .then((data) => setOpp(data.opportunity))
      .catch((err) => setLoadError(err.message || 'Could not load this opportunity.'))
      .finally(() => setLoading(false));
  }, [id]);

  const submit = async () => {
    const trimmed = motivation.trim();
    if (trimmed.length < MIN_MOTIVATION) {
      setMotivationErr(true);
      return;
    }
    setMotivationErr(false);
    setSubmitting(true);
    setSubmitError('');
    try {
      const { application } = await apiPost('/volunteer/applications', {
        opportunityId: id,
        interestDetails: { motivation: trimmed, portfolioUrl, startAvailability },
      });
      navigate(`/confirmation/${application.id}`);
    } catch (err) {
      setSubmitError(err.message || 'Could not submit your application.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-apply-b">
        <div className="page-wrap"><p style={{ textAlign: 'center', color: 'var(--gray-400)' }}>Loading…</p></div>
      </div>
    );
  }

  if (loadError || !opp) {
    return (
      <div className="page-apply-b">
        <div className="page-wrap">
          <p style={{ textAlign: 'center', color: 'var(--gray-600)' }}>{loadError || 'Opportunity not found.'}</p>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button className="back-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => navigate('/find-opportunities')}>
              ← Back to Opportunities
            </button>
          </div>
        </div>
      </div>
    );
  }

  const charCount = motivation.length;
  const charClass = charCount >= MAX_MOTIVATION ? 'over' : charCount > MAX_MOTIVATION * 0.9 ? 'warn' : '';

  return (
    <div className="page-apply-b">
      <div className="page-wrap">
        <a className="back-link" onClick={() => navigate(`/find-opportunities/${id}`)}>← Back to Opportunity</a>

        <div className="header-card">
          <span className="track-chip">Track B · Reviewed Opportunity</span>
          <h2>Express Interest — {opp.title}</h2>
          <p>Tell us why you'd be a great fit. A coordinator will review your application within 3–5 business days.</p>
          <div className="review-info">
            <span className="review-chip">👀 Reviewed by coordinator</span>
            <span className="review-chip">⏱️ 3–5 business days</span>
            <span className="review-chip">🏅 Certificate on completion</span>
          </div>
        </div>

        <div className="form-card">
          <h3>Why are you interested?</h3>
          <p className="card-sub">This is the most important section — be specific and genuine.</p>

          <div className="field-group">
            <label>Your motivation <span className="req">*</span></label>
            <textarea
              rows={5}
              maxLength={MAX_MOTIVATION}
              className={motivationErr ? 'err' : ''}
              placeholder="Tell us why you want to volunteer in this role, what relevant experience you have, and what you hope to contribute. Specific examples make your application stand out…"
              value={motivation}
              onChange={(e) => { setMotivation(e.target.value); if (motivationErr) setMotivationErr(false); }}
            />
            <div className="char-footer">
              <span className={`err-msg ${motivationErr ? 'visible' : ''}`}>Please write at least {MIN_MOTIVATION} characters</span>
              <span className={`char-counter ${charClass}`}>{charCount} / {MAX_MOTIVATION}</span>
            </div>
          </div>

          <div className="field-group" style={{ marginBottom: 0 }}>
            <label>Portfolio / LinkedIn URL <span className="opt">(optional)</span></label>
            <input
              type="url"
              placeholder="https://www.behance.net/yourname or linkedin.com/in/yourname"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
            />
          </div>
        </div>

        <div className="form-card">
          <h3>🗓️ When Can You Start?</h3>
          <p className="card-sub">Select the earliest you'd be available to begin.</p>

          <div className="radio-group">
            {START_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`radio-pill ${startAvailability === opt.value ? 'selected' : ''}`}
                onClick={() => setStartAvailability(opt.value)}
              >
                <input type="radio" name="startDate" value={opt.value} checked={startAvailability === opt.value} readOnly />
                <div className="radio-dot" />
                <div className="radio-pill-text"><h4>{opt.title}</h4><p>{opt.sub}</p></div>
              </label>
            ))}
          </div>
        </div>

        {submitError && <p className="form-error">{submitError}</p>}

        <div className="submit-section">
          <button className="btn-submit" disabled={submitting} onClick={submit}>
            {submitting ? '⏳ Submitting…' : '📨 Submit My Application'}
          </button>
          <p className="submit-hint">The coordinator will review and respond within 3–5 business days.</p>
        </div>
      </div>
    </div>
  );
}
