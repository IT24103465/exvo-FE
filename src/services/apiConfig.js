const LOCAL_API_BASE_URL = 'http://localhost:5000'

export const BACKEND_UNAVAILABLE_MESSAGE = 'Backend service is not currently available'

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? LOCAL_API_BASE_URL : '')
).replace(/\/$/, '')

export const buildApiUrl = (path) => {
  if (!API_BASE_URL) {
    throw new Error(BACKEND_UNAVAILABLE_MESSAGE)
  }

  return `${API_BASE_URL}${path}`
}

export const fetchApi = async (path, options = {}) => {
  try {
    return await fetch(buildApiUrl(path), options)
  } catch (error) {
    if (error.message === BACKEND_UNAVAILABLE_MESSAGE) {
      throw error
    }
    throw new Error(BACKEND_UNAVAILABLE_MESSAGE, { cause: error })
  }
}
