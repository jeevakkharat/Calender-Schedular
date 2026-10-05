import { api } from './axiosClient'

export const eventService = {
  async seed() {
    const todos = []
    let skip = 0
    let total = Infinity
    while (skip < total) {
      const { data } = await api.get('/todos', { params: { limit: 100, skip } })
      todos.push(...data.todos)
      total = data.total
      if (!data.todos.length) break
      skip += data.todos.length
    }
    return todos
  },
  async sync(event, action = 'update') {
    const id = event.remoteId || event.id
    if (action === 'delete') {
      const { data } = await api.delete(`/todos/${id}`)
      return data
    }
    if (action === 'create') {
      const { data } = await api.post('/todos/add', {
        todo: event.title,
        completed: false,
        userId: event.organizerId || 1,
      })
      return data
    }
    const { data } = await api.put(`/todos/${id}`, {
      todo: event.title,
      completed: false,
      userId: event.organizerId || 1,
    })
    return data
  },
}
