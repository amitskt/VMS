const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/admin';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export const adminApi = {
  // Stats
  getStats: () => request('/stats'),

  // Users
  getUsers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/users${query ? `?${query}` : ''}`);
  },
  approveUser: (id) => request(`/users/${id}/approve`, { method: 'PATCH' }),
  rejectUser: (id) => request(`/users/${id}/reject`, { method: 'PATCH' }),
  toggleAccess: (id, reason) =>
    request(`/users/${id}/toggle-access`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }),
  bulkAction: (ids, action) =>
    request('/users/bulk', {
      method: 'PATCH',
      body: JSON.stringify({ ids, action }),
    }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  // Managers
  createManager: (payload) =>
    request('/managers', { method: 'POST', body: JSON.stringify(payload) }),

  // Domains
  getDomains: () => request('/domains'),
  createDomain: (payload) =>
    request('/domains', { method: 'POST', body: JSON.stringify(payload) }),
  updateDomain: (id, payload) =>
    request(`/domains/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteDomain: (id) => request(`/domains/${id}`, { method: 'DELETE' }),

  // Tasks
  getTasks: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/tasks${query ? `?${query}` : ''}`);
  },
  overrideTask: (id, reason) =>
    request(`/tasks/${id}/override`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    }),
};
