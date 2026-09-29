const crypto = require('crypto');

// Uses Google's official Node SDK. This is a NEW dependency — run:
//   npm install @google/genai
// in vmsbackend before starting the server, same as the cookie-parser note
// in server.js. Set GEMINI_API_KEY (and optionally GEMINI_MODEL) in .env.
//
// NOTE: Gemini's exact SDK/model names move fast, and this was written
// without live access to Google's current docs. The original default here
// (gemini-2.5-flash) was confirmed retired via a live 404 from Google's API
// on 2026-08-21, which pointed to gemini-3.6-flash as the replacement — that
// error response is the source of truth for the new default below, not a
// verified doc lookup. If `npm install @google/genai` or the call in
// `callGemini()` below errors again on a model/shape mismatch, check
// https://ai.google.dev/gemini-api/docs for whatever the current model name
// is and update GEMINI_MODEL in .env (or this default) — everything else
// (caching, fallback, prompt building) is independent of the SDK's shape.
let GoogleGenAI;
try {
  ({ GoogleGenAI } = require('@google/genai'));
} catch {
  GoogleGenAI = null; // package not installed yet — heuristicScore() below still works without it
}

const { downloadBuffer } = require('./driveUpload');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

// A volunteer's resume (see models/Volunteer.js resumeKey/resumeMimeType,
// set by controllers/volunteerController.js's uploadResume) is fetched from
// Drive and attached to the Gemini request as an inline document part, so
// matching can weigh actual experience/projects, not just the skill chips
// they picked. Only a PDF is attached this way — Gemini's multimodal
// document understanding is reliably documented for PDF; a .doc/.docx
// resume's content can't be safely assumed readable the same way without a
// live check against Google's current docs (this file was written without
// one — see the GEMINI_MODEL note below for why that matters), so a Word
// resume is only mentioned by name in the text prompt, not attached as
// binary data. If @google/genai's multi-part `contents` shape has changed
// since this was written, the try/catch in computeMatches() below still
// falls back to heuristic scoring rather than breaking matching entirely.
const RESUME_MIME_FOR_GEMINI = 'application/pdf';
const RESUME_MAX_BYTES_FOR_GEMINI = 8 * 1024 * 1024; // guard against an oversized resume bloating the request

// ---------------------------------------------------------------------------
// Cache staleness — a volunteer's cached matches are reused as long as
// neither their profile nor the live set of Track B opportunities has
// changed since they were computed. Any change to either invalidates the
// whole cache (simple and correct, if not maximally granular — fine at this
// project's scale, and avoids needing a job queue/webhooks).
// ---------------------------------------------------------------------------

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

// Only the fields that could actually change what a volunteer matches with.
// resumeKey is included so uploading/replacing a resume invalidates the
// cache too — otherwise a volunteer who adds a resume after their first
// match computation would keep seeing pre-resume scores until something
// else about their profile happened to change.
function profileSignature(volunteer) {
  return hash({
    selectedSkills: volunteer.selectedSkills ? Object.fromEntries(volunteer.selectedSkills) : {},
    mode: volunteer.mode,
    availability: volunteer.availability,
    prefCity: volunteer.prefCity,
    cityTown: volunteer.cityTown,
    engagement: volunteer.engagement,
    portfolio: volunteer.portfolio,
    note: volunteer.note,
    languages: volunteer.languages,
    resumeKey: volunteer.resumeKey || '',
  });
}

// A cheap fingerprint of "which Track B opportunities exist and when each was
// last touched" — cheaper than hashing full opportunity documents, and any
// create/edit/status-change updates `updatedAt`, so it still catches every
// relevant change.
function opportunitySignature(opportunities) {
  return hash(
    opportunities
      .map((o) => `${o._id}:${new Date(o.updatedAt).getTime()}`)
      .sort()
  );
}

function isCacheStale(volunteer, trackBOpportunities) {
  const cache = volunteer.matchCache;
  if (!cache || !cache.computedAt || !Array.isArray(cache.matches)) return true;
  if (cache.profileSignature !== profileSignature(volunteer)) return true;
  if (cache.opportunitySignature !== opportunitySignature(trackBOpportunities)) return true;
  // A model swap (e.g. a retirement forcing GEMINI_MODEL to change) should
  // invalidate old cached scores even though the volunteer/opportunities
  // themselves didn't change — otherwise stale fallback-era scores would be
  // served forever since nothing else about the cache looks "stale".
  if ((cache.modelUsed || '') !== GEMINI_MODEL) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Volunteer profile -> plain text Gemini can reason over.
// ---------------------------------------------------------------------------

function describeVolunteer(volunteer) {
  const skillsFlat = volunteer.selectedSkills
    ? Object.values(Object.fromEntries(volunteer.selectedSkills)).flat()
    : [];
  const availability = volunteer.availability || {};
  const availabilityBits = [];
  if (availability.weekdays) availabilityBits.push(`weekdays (${availability.weekdaysTimeFrom || ''}-${availability.weekdaysTimeTo || ''})`);
  if (availability.weekends) availabilityBits.push('weekends');
  if (availability.holidays) availabilityBits.push('holidays');
  if (availability.flexible) availabilityBits.push('flexible/anytime');

  return {
    skills: skillsFlat.length ? skillsFlat : ['(none selected yet)'],
    preferredMode: volunteer.mode || '(no preference set)',
    availability: availabilityBits.length ? availabilityBits.join(', ') : '(not set)',
    location: [volunteer.cityTown, volunteer.district, volunteer.state].filter(Boolean).join(', ') || '(not set)',
    preferredCity: volunteer.prefCity || '(no preference)',
    languages: volunteer.languages || '(not set)',
    portfolio: volunteer.portfolio ? 'has a portfolio link on file' : 'no portfolio link on file',
    note: volunteer.note || '',
    engagement: volunteer.engagement || '(not set)',
    hasResume: !!volunteer.resumeUrl,
    resumeMimeType: volunteer.resumeMimeType || '',
  };
}

function describeOpportunity(o) {
  return {
    id: String(o._id),
    title: o.title,
    overview: o.overview,
    whatYouWillDo: o.whatYouWillDo || '',
    skillsRequired: o.skills || [],
    mode: o.mode,
    duration: o.duration ? `${o.duration} week${o.duration === 1 ? '' : 's'}` : '',
    timeCommitment: o.timeCommitment ? `${o.timeCommitment} hrs/week` : '',
  };
}

// resumeAttached: true once buildResumePart() below actually got the PDF
// bytes and is passing them to Gemini alongside this prompt — changes how
// the prompt describes the resume so it doesn't claim to have read
// something it never got a copy of.
// When a resume is attached, skills are deliberately left OUT of the prompt
// entirely (not just supplemented) — the resume already reflects them and is
// the more complete signal, per the product decision that skill chips become
// redundant once a real resume is available. The no-resume path is untouched:
// it still scores on the stated skill chips exactly as before.
function buildPrompt(volunteer, opportunities, resumeAttached) {
  const v = describeVolunteer(volunteer);
  const opps = opportunities.map(describeOpportunity);

  const resumeLine = resumeAttached
    ? '- Resume: attached to this request as a PDF — this is the ONLY source you should use for this volunteer\'s skills and experience. A separate skills list is deliberately not provided; the resume already reflects it and is more complete, so do not ask for or assume any skills beyond what the resume shows.'
    : v.hasResume
    ? `- Resume: on file (a ${v.resumeMimeType === 'application/msword' || v.resumeMimeType.includes('wordprocessingml') ? 'Word document' : 'file'}, not attached here) — go by the stated skills above.`
    : '- Resume: none on file — go by the stated skills above.';

  const profileLines = [
    resumeAttached ? null : `- Skills: ${v.skills.join(', ')}`,
    `- Preferred mode: ${v.preferredMode}`,
    `- Availability: ${v.availability}`,
    `- Location: ${v.location}`,
    `- Preferred city for in-person work: ${v.preferredCity}`,
    `- Languages: ${v.languages}`,
    `- Portfolio: ${v.portfolio}`,
    `- Engagement type: ${v.engagement}`,
    `- Note from volunteer: ${v.note || '(none)'}`,
    resumeLine,
  ].filter(Boolean).join('\n');

  const scoringInstruction = resumeAttached
    ? `For EVERY opportunity in the list above, score how well it matches this volunteer on a 0-100 scale based SOLELY on the attached resume — read its skills, experience, and projects and weigh those against each opportunity's requirements. Do not use any separate skills list (none is provided); the resume is the sole basis for this scoring. Give 1-3 short, specific reasons for each score, referencing concrete resume content where possible (e.g. "Your resume shows 2 years of GIS mapping experience, relevant to this role's field survey work"). Vocabulary in the resume and in an opportunity's requirements may differ — match on MEANING, not exact string equality. Consider mode preference and availability as secondary signals, resume content as the primary one.`
    : `For EVERY opportunity in the list above, score how well it matches this volunteer's profile on a 0-100 scale, and give 1-3 short, specific reasons for that score (e.g. "Your Web Development skill matches this role's Digital, Tech & Data requirement" or "You prefer remote work; this role is field-based"). Skill names on the volunteer's side and the opportunity's side use different vocabularies (e.g. volunteer skill "Content Writing" vs opportunity skill "Content & Communication") — match on MEANING, not exact string equality. Consider mode preference and availability as secondary signals, skills as the primary ones.`;

  return `You are matching a volunteer to skilled ("Track B") volunteering opportunities at an environmental NGO called SankalpTaru.

VOLUNTEER PROFILE:
${profileLines}

OPPORTUNITIES (JSON array, one entry per opportunity):
${JSON.stringify(opps, null, 2)}

${scoringInstruction}

Return ONLY a JSON array, one object per opportunity, in this exact shape, with no other text:
[{"opportunityId": "<id>", "score": <integer 0-100>, "reasons": ["<short reason>", ...]}]`;
}

// Fetches the volunteer's resume from Drive and packages it as a Gemini
// inline document part, or returns null if there's no resume, it isn't a
// PDF, it's too large, or the Drive fetch fails for any reason — always a
// soft failure (logged, not thrown), since matching should still proceed
// on skills alone rather than blow up over a resume that couldn't be read.
async function buildResumePart(volunteer) {
  if (!volunteer.resumeKey || volunteer.resumeMimeType !== RESUME_MIME_FOR_GEMINI) return null;
  try {
    const buffer = await downloadBuffer(volunteer.resumeKey);
    if (buffer.length > RESUME_MAX_BYTES_FOR_GEMINI) return null;
    return { inlineData: { mimeType: RESUME_MIME_FOR_GEMINI, data: buffer.toString('base64') } };
  } catch (err) {
    console.warn('[geminiMatcher] Could not fetch resume for matching, scoring on skills alone:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gemini call
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// UNAVAILABLE (503, "high demand") and RESOURCE_EXHAUSTED (429, rate limit)
// are momentary — the model itself is fine, Google's servers are just
// overloaded for a moment. Worth a couple of quick retries before giving up
// and dropping to the heuristic scorer, so a single transient blip doesn't
// knock every volunteer's request down to the coarser fallback. A real
// problem (bad model name, bad API key, malformed request) won't have these
// codes and will still fail fast on the first attempt.
const RETRYABLE_PATTERN = /"code":\s*(503|429)|UNAVAILABLE|RESOURCE_EXHAUSTED/;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [500, 1500]; // between attempts 1->2 and 2->3

// resumePart: the object buildResumePart() returned, or null/undefined —
// when present, `contents` switches from a plain string to the multi-part
// array shape (text + inlineData) @google/genai expects for attaching a
// document alongside a text prompt in one request.
async function callGemini(prompt, resumePart) {
  if (!GoogleGenAI) throw new Error('@google/genai is not installed — run npm install @google/genai');
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set in .env');

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents = resumePart ? [{ role: 'user', parts: [{ text: prompt }, resumePart] }] : prompt;

  let lastErr;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                opportunityId: { type: 'string' },
                score: { type: 'integer' },
                reasons: { type: 'array', items: { type: 'string' } },
              },
              required: ['opportunityId', 'score', 'reasons'],
            },
          },
        },
      });

      // The SDK exposes the plain text of the response as `.text` — see the
      // header comment if this shape has changed since this was written.
      const raw = typeof response.text === 'function' ? response.text() : response.text;
      return JSON.parse(raw);
    } catch (err) {
      lastErr = err;
      const isRetryable = RETRYABLE_PATTERN.test(err.message || '');
      const hasAttemptsLeft = attempt < MAX_ATTEMPTS - 1;
      if (!isRetryable || !hasAttemptsLeft) throw err;
      console.warn(`[geminiMatcher] Transient error (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying: ${err.message}`);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastErr; // unreachable, but keeps the function's return type honest
}

// ---------------------------------------------------------------------------
// Fallback: plain keyword-overlap heuristic, used only if Gemini is
// unavailable (no key configured yet, package not installed, API error,
// quota, etc.) so the Dashboard/Opportunities pages still show *something*
// reasonable instead of erroring out.
// ---------------------------------------------------------------------------

function normalizeWords(str) {
  return (str || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

function heuristicScore(volunteer, opportunity) {
  const v = describeVolunteer(volunteer);
  const volunteerWords = new Set([
    ...v.skills.flatMap(normalizeWords),
    ...normalizeWords(v.note),
  ]);
  const oppWords = new Set([
    ...(opportunity.skills || []).flatMap(normalizeWords),
    ...normalizeWords(opportunity.title),
    ...normalizeWords(opportunity.overview),
  ]);
  let overlap = 0;
  oppWords.forEach((w) => { if (volunteerWords.has(w)) overlap++; });

  let score = Math.min(70, overlap * 18); // keyword overlap alone caps below Gemini's ceiling — it's a weaker signal
  if (v.preferredMode && opportunity.mode && v.preferredMode.toLowerCase() === opportunity.mode.toLowerCase()) {
    score += 15;
  }
  score = Math.max(5, Math.min(100, score || 20));

  const reasons = [];
  if (overlap > 0) reasons.push('Some overlap between your skills and this role’s requirements.');
  if (v.preferredMode && opportunity.mode && v.preferredMode.toLowerCase() === opportunity.mode.toLowerCase()) {
    reasons.push(`Matches your preferred mode (${opportunity.mode}).`);
  }
  if (!reasons.length) reasons.push('General match based on your profile.');

  return { opportunityId: String(opportunity._id), score: Math.round(score), reasons };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

// Turns Gemini's raw parsed response into the final matches array, filling
// in any opportunity Gemini skipped with the heuristic score rather than
// silently dropping it. Shared by both attempts in computeMatches() below.
function finalizeMatches(parsed, trackBOpportunities, volunteer) {
  const validIds = new Set(trackBOpportunities.map((o) => String(o._id)));

  const matches = (Array.isArray(parsed) ? parsed : [])
    .filter((m) => m && validIds.has(String(m.opportunityId))) // never trust an id Gemini invents
    .map((m) => ({
      opportunityId: String(m.opportunityId),
      score: Math.max(0, Math.min(100, Math.round(Number(m.score) || 0))),
      reasons: Array.isArray(m.reasons) ? m.reasons.slice(0, 3).map(String) : [],
    }));

  const scored = new Set(matches.map((m) => m.opportunityId));
  trackBOpportunities.forEach((o) => {
    if (!scored.has(String(o._id))) matches.push(heuristicScore(volunteer, o));
  });

  return matches;
}

// Returns { matches: [{opportunityId, score, reasons}], usedFallback }
async function computeMatches(volunteer, trackBOpportunities) {
  if (trackBOpportunities.length === 0) {
    return { matches: [], usedFallback: false };
  }

  const resumePart = await buildResumePart(volunteer);

  // Attaching a resume roughly doubles the size/complexity of the request
  // (a whole PDF alongside the text prompt), and a bigger multimodal
  // request is more exposed to Gemini's own capacity limits (503
  // "UNAVAILABLE" / high demand) than the plain skills-only prompt this
  // app used before resume-aware matching existed — callGemini() already
  // retries a 503/429 a couple of times, but if it still fails, drop the
  // resume and retry ONCE more with the exact same lightweight, previously-
  // reliable text-only call before giving up to the coarse heuristic
  // scorer. Only worth doing when a resume was actually attached — a
  // volunteer with no resume has nothing lighter to retry with.
  try {
    const prompt = buildPrompt(volunteer, trackBOpportunities, !!resumePart);
    const parsed = await callGemini(prompt, resumePart);
    return { matches: finalizeMatches(parsed, trackBOpportunities, volunteer), usedFallback: false };
  } catch (err) {
    if (!resumePart) {
      console.warn('[geminiMatcher] Falling back to heuristic scoring:', err.message);
      return { matches: trackBOpportunities.map((o) => heuristicScore(volunteer, o)), usedFallback: true };
    }

    console.warn('[geminiMatcher] Resume-attached request failed, retrying without the resume:', err.message);
    try {
      const prompt = buildPrompt(volunteer, trackBOpportunities, false);
      const parsed = await callGemini(prompt, null);
      return { matches: finalizeMatches(parsed, trackBOpportunities, volunteer), usedFallback: false };
    } catch (err2) {
      console.warn('[geminiMatcher] Falling back to heuristic scoring:', err2.message);
      return { matches: trackBOpportunities.map((o) => heuristicScore(volunteer, o)), usedFallback: true };
    }
  }
}

module.exports = {
  computeMatches,
  isCacheStale,
  profileSignature,
  opportunitySignature,
  GEMINI_MODEL,
};
