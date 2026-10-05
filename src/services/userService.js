import { api } from './axiosClient'

export const userService = {
  async list(skip = 0) {
    const { data } = await api.get('/users', {
      params: { limit: 30, skip, select: 'firstName,lastName,image,email' },
    })
    return data.users
  },
  async search(query) {
    const { data } = await api.get('/users/search', {
      params: { q: query, limit: 30, select: 'firstName,lastName,image,email' },
    })
    return data.users
  },
  async get(id) {
    const { data } = await api.get(`/users/${id}`)
    return data
  },
}
