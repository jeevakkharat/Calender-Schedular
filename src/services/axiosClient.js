import axios from 'axios'

export const api = axios.create({
  baseURL: 'https://dummyjson.com',
  timeout: 15000,
})

api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(toApiError(error)),
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
