import { api, clearToken, setToken } from './api.js'

export const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'admin123',
  role: 'admin',
  name: '管理员'
}

let sessionUser = null
let defaultAdminHint = false

export function currentUser() {
  return sessionUser
}

export function isDefaultAdminPassword() {
  return defaultAdminHint
}

export async function fetchLoginHint() {
  try {
    const data = await api('/api/auth/hint')
    defaultAdminHint = !!data.defaultAdminPassword
  } catch {
    defaultAdminHint = false
  }
  return defaultAdminHint
}

export async function restoreSession() {
  try {
    const data = await api('/api/auth/me')
    sessionUser = data.user
    return sessionUser
  } catch {
    sessionUser = null
    clearToken()
    return null
  }
}

export async function login(username, password) {
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    })
    setToken(data.token)
    sessionUser = data.user
    return { ok: true, user: data.user }
  } catch (err) {
    sessionUser = null
    clearToken()
    return { ok: false, error: err.message || '登录失败' }
  }
}

export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' })
  } catch {
    /* ignore */
  }
  sessionUser = null
  clearToken()
}

export async function publicUsers() {
  const data = await api('/api/users')
  return data.users || []
}

export async function addUser({ username, password, name, role }) {
  try {
    await api('/api/users', {
      method: 'POST',
      body: { username, password, name, role }
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message || '添加失败' }
  }
}

export async function removeUser(id) {
  try {
    await api(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message || '删除失败' }
  }
}

export async function changeOwnPassword({ oldPassword, newPassword, confirmPassword }) {
  try {
    await api('/api/users/password', {
      method: 'POST',
      body: { oldPassword, newPassword, confirmPassword }
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message || '修改失败' }
  }
}

export async function resetUserPassword(id, newPassword) {
  try {
    await api(`/api/users/${encodeURIComponent(id)}/reset-password`, {
      method: 'POST',
      body: { password: newPassword }
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message || '重置失败' }
  }
}
