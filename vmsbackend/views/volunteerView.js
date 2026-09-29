
function toPublicVolunteer(volunteer) {
  return {
    id: volunteer._id,
    email: volunteer.email,
    role: volunteer.role,

    // Profile.jsx
    firstName: volunteer.firstName,
    lastName: volunteer.lastName,
    phone: volunteer.phone,
    ageRange: volunteer.ageRange,
    gender: volunteer.gender,
    bloodGroup: volunteer.bloodGroup,
    pincode: volunteer.pincode,
    state: volunteer.state,
    district: volunteer.district,
    cityTown: volunteer.cityTown,
    engagement: volunteer.engagement,
    photoUrl: volunteer.photoUrl,
    resumeUrl: volunteer.resumeUrl,
    resumeFileName: volunteer.resumeFileName,
    resumeUploadedAt: volunteer.resumeUploadedAt,
    profileCompletedAt: volunteer.profileCompletedAt,

    // Skills.jsx
    selectedSkills: volunteer.selectedSkills ? Object.fromEntries(volunteer.selectedSkills) : {},
    totalSkills: volunteer.totalSkills,
    availability: volunteer.availability,
    mode: volunteer.mode,
    prefCity: volunteer.prefCity,
    languages: volunteer.languages,
    portfolio: volunteer.portfolio,
    note: volunteer.note,
    skillsCompletedAt: volunteer.skillsCompletedAt,
    
    createdAt: volunteer.createdAt,
  };
}
module.exports = { toPublicVolunteer };
