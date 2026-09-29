// "View" layer for Manager/Admin: keeps the response shape identical
// regardless of which collection the record actually came from.
function toPublicStaff(staffDoc, role) {
  return {
    id: staffDoc._id,
    name: staffDoc.name,
    email: staffDoc.email,
    role, // 'manager' | 'admin'
    createdAt: staffDoc.createdAt,
  };
}

module.exports = { toPublicStaff };
