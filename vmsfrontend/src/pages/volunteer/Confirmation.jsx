import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet } from './api';
import './Confirmation.css';

/**
 * Converted from 09-confirmation.html, wired to the real backend — shown
 * right after ClaimTrackA.jsx / ApplyTrackB.jsx submit successfully. The
 * mockup's page had a manual Track A/B toggle purely to demo both states in
 * one static file; here the real application's track decides which panel
 * shows, no toggle needed.
 */

const TRACK_A_STEPS = [
  { title: 'Opportunity Claimed', body: 'Your spot is reserved. No review needed.', chip: 'Done just now', done: true },
  { title: 'Do the Work', body: 'Complete the activity in your own time — no deadline.', chip: 'Anytime — no deadline', done: false },
  { title: 'Submit Your Proof', body: 'Submit a photo and a short write-up from My Applications. Your submission is auto-approved instantly.', chip: 'From My Applications', done: false },
  { title: 'Your Certificate Arrives', body: "A verified digital certificate with your name is instantly generated.", chip: 'Auto-generated · No wait', done: false },
];

const TRACK_B_STEPS = [
  { title: 'Interest Submitted', body: 'Your profile and motivation have been submitted to the SankalpTaru team for review.', chip: 'Done just now', done: true },
  { title: 'Profile Review', body: 'The coordinator will review your motivation and portfolio. This typically takes 3–5 business days.', chip: '3–5 business days', done: false },
  { title: 'You May Be Contacted', body: 'The team may reach out via email or phone before making a decision.', chip: 'Via email or phone', done: false },
  { title: 'Task Assigned → Submit Work', body: 'Once shortlisted and assigned a task, complete and submit it from My Applications. Certificate issued on approval.', chip: 'My Applications', done: false },
];

function useConfetti(canvasRef, active) {
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = ['#9AD14B', '#1F6B52', '#D8B75C', '#8FD3FF', '#DDE8D5', '#ffffff', '#F5F1E8'];
    const particles = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 300,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 1.5,
      r: Math.random() * 8 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360,
      rs: (Math.random() - 0.5) * 6,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    }));
    let running = true;
    let frame;
    function draw() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.r / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.r / 2, -p.r * 0.4, p.r, p.r * 0.5);
        }
        ctx.restore();
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rs;
        if (p.y > canvas.height) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
      });
      frame = requestAnimationFrame(draw);
    }
    draw();
    const stopTimer = setTimeout(() => {
      running = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, 5000);
    return () => {
      running = false;
      clearTimeout(stopTimer);
      cancelAnimationFrame(frame);
    };
  }, [active, canvasRef]);
}

export default function Confirmation() {
  const navigate = useNavigate();
  const { id } = useParams();
  const canvasRef = useRef(null);

  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet(`/volunteer/applications/${id}`)
      .then((data) => setApp(data.application))
      .catch((err) => setError(err.message || 'Could not load this confirmation.'))
      .finally(() => setLoading(false));
  }, [id]);

  useConfetti(canvasRef, !loading && !error && !!app);

  if (loading) return <div className="page-confirmation"><p style={{ textAlign: 'center', paddingTop: 80, color: 'var(--gray-400)' }}>Loading…</p></div>;
  if (error || !app) {
    return (
      <div className="page-confirmation">
        <div className="page-wrap">
          <p style={{ textAlign: 'center', color: 'var(--gray-600)', paddingTop: 40 }}>{error || 'Confirmation not found.'}</p>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button className="btn-primary" onClick={() => navigate('/dashboard')} style={{ maxWidth: 260, margin: '0 auto' }}>Go to Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  const isTrackA = app.track === 'a';
  const steps = isTrackA ? TRACK_A_STEPS : TRACK_B_STEPS;
  const title = isTrackA ? "You're in!" : 'Interest Submitted!';
  const sub = isTrackA
    ? `Your ${app.opportunity.title} claim has been registered. Submit your proof of work anytime from My Applications to receive your instant digital certificate.`
    : `Your profile and motivation for ${app.opportunity.title} have been sent to the SankalpTaru team. You'll hear back in 3–5 business days.`;

  return (
    <div className="page-confirmation">
      <canvas ref={canvasRef} id="confetti" />

      <div className="page-wrap">
        <div className="hero-card">
          <div className="success-ring"><div className="success-icon">{isTrackA ? '🎉' : '📋'}</div></div>
          <div className="track-pill">{isTrackA ? '✓ Track A · Claimed' : '⏳ Track B · Under Review'}</div>
          <h1>{title}</h1>
          <p className="sub">{sub}</p>
          <div className="ref-row">
            <span className="ref-label">Reference ID</span>
            <span className="ref-code">{app.referenceId}</span>
          </div>
        </div>

        <div className="impact-strip">
          <div className="impact-tile">
            <div className="i-icon">🌳</div>
            <div className="i-num">1</div>
            <div className="i-label">{isTrackA ? 'Opportunity Claimed' : 'Application Submitted'}</div>
          </div>
          <div className="impact-tile">
            <div className="i-icon">🏅</div>
            <div className="i-num">{isTrackA ? '1' : '—'}</div>
            <div className="i-label">{isTrackA ? 'Certificate Pending' : 'Certificate on Approval'}</div>
          </div>
          <div className="impact-tile">
            <div className="i-icon">⚡</div>
            <div className="i-num">0</div>
            <div className="i-label">Hours Logged</div>
          </div>
        </div>

        <div className="steps-card">
          <h2>{isTrackA ? '🌱' : '📋'} What Happens Next?</h2>
          <div className="step-list">
            {steps.map((s, i) => (
              <div className={`step-item ${s.done ? 'completed' : ''}`} key={i}>
                <div className="step-num">{s.done ? '✓' : i === steps.length - 1 ? '🏅' : i + 1}</div>
                <div className="step-body">
                  <h4>{s.title}</h4>
                  <p>{s.body}</p>
                  <span className={`step-chip ${s.done ? 'done' : ''}`}>{s.chip}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="quick-row">
          <div className="quick-card" onClick={() => navigate('/my-applications')}>
            <div className="q-icon">📋</div>
            <h4>My Applications</h4>
            <p>Track progress &amp; submit work</p>
          </div>
          <div className="quick-card" onClick={() => navigate('/find-opportunities')}>
            <div className="q-icon">🔍</div>
            <h4>Browse More</h4>
            <p>Discover opportunities</p>
          </div>
        </div>

        <div className="cta-stack">
          <button className="btn-primary" onClick={() => navigate('/dashboard')}>🌿 Go to My Volunteer Dashboard →</button>
          <button className="btn-secondary" onClick={() => navigate('/find-opportunities')}>Browse More Opportunities</button>
        </div>
      </div>
    </div>
  );
}
