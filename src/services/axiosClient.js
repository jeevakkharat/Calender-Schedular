import axios from 'axios'

const TOKEN_KEY = 'calendar.accessToken'
const REFRESH_KEY = 'calendar.refreshToken'

export const api = axios.create({
  baseURL: 'https://dummyjson.com',
  timeout: 15000,
})

let refreshInFlight

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token && !config.url?.includes('/auth/login') && !config.url?.includes('/auth/refresh')) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const status = error.response?.status
    if (status === 401 && original && !original._retried &&
        !original.url?.includes('/auth/login') && !original.url?.includes('/auth/refresh')) {
      const refreshToken = localStorage.getItem(REFRESH_KEY)
      if (refreshToken) {
        original._retried = true
        try {
          refreshInFlight ??= api.post('/auth/refresh', { refreshToken, expiresInMins: 30 })
            .then(({ data }) => {
              localStorage.setItem(TOKEN_KEY, data.accessToken)
              if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken)
              return data.accessToken
            })
            .finally(() => { refreshInFlight = undefined })
          const token = await refreshInFlight
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        } catch (refreshError) {
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(REFRESH_KEY)
          window.dispatchEvent(new Event('calendar:session-expired'))
          return Promise.reject(toApiError(refreshError))
        }
      }
    }
    return Promise.reject(toApiError(error))
  },
)

export function toApiError(error) {
  const networkMessage = error.code === 'ERR_NETWORK' || error.message === 'Network Error'
    ? 'Unable to reach DummyJSON. Check your connection and retry; the service may be temporarily unavailable or rate-limiting requests.'
    : null
  return {
    message: error.response?.data?.message || networkMessage || error.message || 'The request could not be completed.',
    status: error.response?.status ?? null,
    data: error.response?.data ?? null,
  }
}

export { TOKEN_KEY, REFRESH_KEY }
