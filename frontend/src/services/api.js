const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

async function getCollection(path, collectionKey, signal) {
  let response

  try {
    response = await fetch(`${API_BASE_URL}/${path}`, { signal })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error(`Could not reach the API at ${API_BASE_URL}. Check that the backend is running and CORS is enabled.`)
  }

  const responseText = await response.text()
  let body
  try {
    body = responseText ? JSON.parse(responseText) : null
  } catch {
    body = null
  }

  if (!response.ok) {
    const message = body && typeof body.message === 'string'
      ? body.message
      : responseText.trim().slice(0, 300) || response.statusText
    throw new Error(`${path} request failed (${response.status}): ${message}`)
  }

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
