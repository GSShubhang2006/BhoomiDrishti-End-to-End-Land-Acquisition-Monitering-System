const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error(`Could not reach the API at ${API_BASE_URL}. Check that the backend is running and CORS is enabled.`)
  }
  const text = await response.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!response.ok) {
    const error = new Error(body && typeof body.message === 'string' ? body.message : `Request failed (${response.status})`)
    error.status = response.status
    throw error
  }
  if (!body) throw new Error('The API returned an empty response.')
  return body
}

async function getCollection(path, collectionKey, signal) {
  const body = await request(path, { signal })

  if (!body || !Array.isArray(body[collectionKey])) {
    throw new Error(`${path} returned an unexpected response. Expected an array in "${collectionKey}".`)
  }

  return body[collectionKey]
}

export function getProjects({ signal } = {}) {
  return getCollection('projects', 'projects', signal)
}

export function getLandParcels({ signal } = {}) {
  return getCollection('land-parcels', 'landParcels', signal)
}

export function getFieldVerifications({ signal } = {}) {
  return getCollection('field-verifications', 'fieldVerifications', signal)
}

export function getReadiness({ signal } = {}) {
  return getCollection('readiness', 'readiness', signal)
}

export function getNotifications({ signal } = {}) {
  return getCollection('notifications', 'notifications', signal)
}

export function getAuditLogs({ signal } = {}) {
  return getCollection('audit-logs', 'auditLogs', signal)
}

export function getFieldOfficers({ signal } = {}) {
  return getCollection('users/field-officers', 'officers', signal)
}

export async function getAcquisitionProposals(params = {}, { signal } = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''))
  const suffix = query.size ? `?${query}` : ''
  const body = await request(`acquisition-proposals${suffix}`, { signal })
  if (!body || !Array.isArray(body.proposals)) throw new Error('Acquisition proposals returned an unexpected response.')
  return body
}

export function getAcquisitionProposal(id, { signal } = {}) {
  return request(`acquisition-proposals/${encodeURIComponent(id)}`, { signal })
}

export function getProposalReviewers({ signal } = {}) {
  return getCollection('acquisition-proposals/reviewers', 'reviewers', signal)
}

export function saveAcquisitionProposal(proposal, id) {
  return request(id ? `acquisition-proposals/${encodeURIComponent(id)}` : 'acquisition-proposals', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(proposal),
  })
}

export function submitAcquisitionProposal(id) {
  return request(`acquisition-proposals/${encodeURIComponent(id)}/submit`, { method: 'POST' })
}

export function assignProposalReviewer(id, reviewerId) {
  return request(`acquisition-proposals/${encodeURIComponent(id)}/assign-reviewer`, {
    method: 'POST',
    body: JSON.stringify({ reviewerId }),
  })
}

export function reviewAcquisitionProposal(id, action, remarks) {
  return request(`acquisition-proposals/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    body: JSON.stringify({ action, remarks }),
  })
}

export function withdrawAcquisitionProposal(id) {
  return request(`acquisition-proposals/${encodeURIComponent(id)}/withdraw`, { method: 'POST' })
}

export function linkProposalProject(id, projectId) {
  return request(`acquisition-proposals/${encodeURIComponent(id)}/link-project`, {
    method: 'POST',
    body: JSON.stringify({ projectId }),
  })
}

export function getCurrentUser() {
  return request('auth/me')
}

export function signIn(credentials) {
  return request('auth/login', { method: 'POST', body: JSON.stringify(credentials) })
}

export function signOut() {
  return request('auth/logout', { method: 'POST' })
}

export function updateProfile(profile) {
  return request('auth/me', { method: 'PATCH', body: JSON.stringify(profile) })
}

export function saveProject(project, id) {
  return request(id ? `projects/${encodeURIComponent(id)}` : 'projects', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(project),
  })
}

export function archiveProject(id) {
  return request(`projects/${encodeURIComponent(id)}/archive`, { method: 'POST' })
}

export function saveLandParcel(parcel, id) {
  return request(id ? `land-parcels/${encodeURIComponent(id)}` : 'land-parcels', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(parcel),
  })
}

export function resolveNotification(id, reason) {
  return request(`notifications/${encodeURIComponent(id)}/resolve`, { method: 'POST', body: JSON.stringify({ reason }) })
}

export function markNotificationRead(id) {
  return request(`notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' })
}

export function markAllNotificationsRead() {
  return request('notifications/read-all', { method: 'PATCH' })
}

export function saveFieldVerification(verification, id) {
  return request(id ? `field-verifications/${encodeURIComponent(id)}` : 'field-verifications', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(verification),
  })
}
