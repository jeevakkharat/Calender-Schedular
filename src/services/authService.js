import { api, REFRESH_KEY, TOKEN_KEY } from './axiosClient'

export const authService = {
  async login(username, password) {
    const { data } = await api.post('/auth/login', { username, password, expiresInMins: 1 })
    localStorage.setItem(TOKEN_KEY, data.accessToken)
    localStorage.setItem(REFRESH_KEY, data.refreshToken)
    return data
  },
  async me() {
    const { data } = await api.get('/auth/me')
    return data
  },
  logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
  hasSession() {
    return Boolean(localStorage.getItem(TOKEN_KEY))
  },
}
