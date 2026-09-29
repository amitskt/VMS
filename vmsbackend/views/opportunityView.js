// "View" layer for Opportunity — same convention as staffView.js /
// volunteerView.js: keeps the response shape stable and decoupled from the
// Mongoose document's internal field names.
function toPublicOpportunity(doc) {
  return {
    id: doc._id,
    title: doc.title,
    overview: doc.overview,
    whatYouWillDo: doc.whatYouWillDo || '',
    whatYouWillLearn: doc.whatYouWillLearn || '',
    mode: doc.mode,
    duration: doc.duration || '',
    timeCommitment: doc.timeCommitment || '',
    capacity: doc.capacity ?? null,
    track: doc.track,
    skills: doc.skills || [],
    depts: doc.depts || [],
    // Only the fields volunteers/managers actually need to view/download —
    // never the raw Drive `key`, which is an internal implementation
    // detail (also used by deleteOpportunityDocument to find the file).
    documents: (doc.documents || []).map((d) => ({
      id: d._id,
      url: d.url,
      fileName: d.fileName,
      uploadedAt: d.uploadedAt,
    })),
    status: doc.status,
    apps: doc.apps,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

module.exports = { toPublicOpportunity };
