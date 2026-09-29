/**
 * In-memory "mock backend" for Opportunities — there is no Opportunity
 * model/controller/routes in vmsbackend yet (this feature was requested as
 * frontend-only). This module plays the role a real API would: it holds
 * the data and the read/write operations, so Opportunities.jsx and
 * CreateEditOpportunity.jsx can share one source of truth and a manager's
 * edits actually persist while navigating between the two pages (until the
 * tab is refreshed — this is memory, not a database).
 *
 * When a real backend exists, swap the bodies of these functions for
 * `fetch()` calls (same pattern as volunteerAdminController.js /
 * Volunteers.jsx) — the function names and shapes below are deliberately
 * written to look like what those calls would return.
 */

export const DEPARTMENTS = [
  'IT',
  'Programs',
  'Operations',
  'Impact Reporting',
  'Design & Innovation',
  'Patron Care',
];

export const SKILLS = [
  'Content & Communication',
  'Design & Creative',
  'Digital, Tech & Data',
  'Research & Documentation',
  'Education & Training',
  'Field & Community Support',
  'Outreach & Partnerships',
  'Landscape & Sustainability',
];

export const MODES = ['Remote', 'Field-based', 'Hybrid'];

let nextId = 10;

// Seeded from the admin-03-opportunities.html mockup's data set.
let opportunities = [
  { id: 1, title: 'Tree Planting Diary', track: 'a', depts: ['Programs'], status: 'active', apps: 1240, capacity: '', overview: 'Document your tree-planting activity with photos and a short diary entry.', whatYouWillDo: '', whatYouWillLearn: '', mode: 'Field-based', duration: '', timeCommitment: '', skills: ['Field & Community Support'], created: '12 Jan 2026' },
  { id: 2, title: 'Green Pledge Social Post', track: 'a', depts: ['Patron Care'], status: 'active', apps: 860, capacity: '', overview: 'Share a green pledge on social media to spread awareness.', whatYouWillDo: '', whatYouWillLearn: '', mode: 'Remote', duration: '', timeCommitment: '', skills: ['Content & Communication'], created: '12 Jan 2026' },
  { id: 3, title: 'Environmental Awareness Quiz', track: 'a', depts: ['Impact Reporting'], status: 'active', apps: 2015, capacity: '', overview: 'Take a short quiz on environmental awareness.', whatYouWillDo: '', whatYouWillLearn: '', mode: 'Remote', duration: '', timeCommitment: '', skills: ['Research & Documentation'], created: '12 Jan 2026' },
  { id: 4, title: 'Plantation Drive Check-in', track: 'a', depts: ['Programs', 'Operations'], status: 'active', apps: 430, capacity: '', overview: 'Check in at a plantation drive near you.', whatYouWillDo: '', whatYouWillLearn: '', mode: 'Field-based', duration: '', timeCommitment: '', skills: ['Field & Community Support'], created: '03 Feb 2026' },
  { id: 5, title: 'Social Media Volunteer — Climate Campaigns', track: 'b', depts: ['Design & Innovation'], status: 'active', apps: 14, capacity: '5', overview: 'Support our climate campaigns across social channels.', whatYouWillDo: 'Draft captions\nSchedule posts', whatYouWillLearn: 'Campaign planning\nBrand voice', mode: 'Remote', duration: '4 weeks', timeCommitment: '3–5 hrs/week', skills: ['Content & Communication', 'Design & Creative'], created: '18 Mar 2026' },
  { id: 6, title: 'Research Volunteer — Agroforestry Study', track: 'b', depts: ['Programs'], status: 'active', apps: 9, capacity: '3', overview: 'Assist with a field research study on agroforestry practices.', whatYouWillDo: 'Compile field notes\nInterview farmers', whatYouWillLearn: 'Research methods\nData collection', mode: 'Hybrid', duration: '6 weeks', timeCommitment: '5 hrs/week', skills: ['Research & Documentation'], created: '22 Mar 2026' },
  { id: 7, title: 'Donor Newsletter Writer', track: 'b', depts: ['Patron Care'], status: 'active', apps: 6, capacity: '2', overview: 'Write engaging content for our donor newsletter.', whatYouWillDo: 'Draft newsletter copy', whatYouWillLearn: 'Donor communications', mode: 'Remote', duration: '4 weeks', timeCommitment: '3 hrs/week', skills: ['Content & Communication'], created: '02 Apr 2026' },
  { id: 8, title: 'SEO Technical Audit & JSON-LD Implementation', track: 'b', depts: ['IT'], status: 'deactivated', apps: 3, capacity: '1', overview: 'Audit the site for SEO issues and implement structured data.', whatYouWillDo: 'Run technical audit\nImplement JSON-LD', whatYouWillLearn: 'Technical SEO', mode: 'Remote', duration: '3 weeks', timeCommitment: '4 hrs/week', skills: ['Digital, Tech & Data'], created: '15 Apr 2026' },
  { id: 9, title: 'Corporate ESG Partner Onboarding Kit', track: 'b', depts: ['Patron Care', 'IT'], status: 'draft', apps: 0, capacity: '4', overview: 'Build an onboarding kit for corporate ESG partners.', whatYouWillDo: 'Draft onboarding materials', whatYouWillLearn: 'Partner relations', mode: 'Hybrid', duration: '5 weeks', timeCommitment: '4 hrs/week', skills: ['Outreach & Partnerships', 'Content & Communication'], created: '9 Jul 2026' },
];

function todayLabel() {
  // Matches the mockup's "12 Jan 2026" style. Real dates would come from
  // the backend (see formatDate() in Volunteers.jsx) — this is a plain JS
  // Date since there's no server round-trip to timestamp it for us here.
  const d = new Date();
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, ' ');
}

export function listOpportunities() {
  return opportunities;
}

export function getOpportunity(id) {
  return opportunities.find((o) => String(o.id) === String(id)) || null;
}

export function createOpportunity(data) {
  const opp = {
    id: nextId++,
    apps: 0,
    created: todayLabel(),
    ...data,
  };
  opportunities = [opp, ...opportunities];
  return opp;
}

export function updateOpportunity(id, data) {
  opportunities = opportunities.map((o) => (String(o.id) === String(id) ? { ...o, ...data } : o));
  return getOpportunity(id);
}

export function toggleOpportunityStatus(id) {
  const opp = getOpportunity(id);
  if (!opp) return;
  updateOpportunity(id, { status: opp.status === 'deactivated' ? 'active' : 'deactivated' });
}

export function archiveOpportunity(id) {
  const opp = getOpportunity(id);
  if (!opp || opp.apps > 0) return;
  updateOpportunity(id, { status: 'archived' });
}
