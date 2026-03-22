'use strict';

const API_BASE = 'http://localhost:3000';

//  HELPER: Get Auth Header 
function getAuthHeader() {
  const token = sessionStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

//  HELPER: Fetch with Auth 
async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...(options.headers || {})
    }
  });
  return res;
}

//  CURRENT USER STATE 
let currentUser = null;

function setAuthState(isAuth, user) {
  currentUser = user || null;
  const body = document.body;
  if (isAuth && user) {
    body.classList.remove('not-authenticated');
    body.classList.add('authenticated');
    body.classList.toggle('is-admin', user.role === 'admin');
    document.getElementById('nav-username').textContent = user.username || user.email;
    document.getElementById('nav-avatar').textContent = (user.username || 'U')[0].toUpperCase();
  } else {
    body.classList.add('not-authenticated');
    body.classList.remove('authenticated', 'is-admin');
    currentUser = null;
  }
}

//  REGISTRATION 
async function register() {
  const username = document.getElementById('reg-firstname').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  if (!username || !email || !password) {
    showToast('All fields are required.', 'danger'); return;
  }
  if (password.length < 6) {
    showToast('Password must be at least 6 characters.', 'danger'); return;
  }

  try {
    const res  = await apiFetch('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();

    if (res.ok) {
      showToast(`Registered as ${data.username}! Please log in.`, 'success');
      navigateTo('#/login');
    } else {
      showToast(data.error || 'Registration failed.', 'danger');
    }
  } catch {
    showToast('Network error. Is the backend running?', 'danger');
  }
}

//  LOGIN 
async function loginUser() {
  const username = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const alertEl  = document.getElementById('login-alert');

  try {
    const res  = await apiFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok) {
      // Save token in sessionStorage (clears on browser close)
      sessionStorage.setItem('authToken', data.token);
      setAuthState(true, data.user);
      alertEl.classList.add('d-none');
      showToast(`Welcome back, ${data.user.username}!`, 'success');
      navigateTo('#/profile');
    } else {
      alertEl.textContent = data.error || 'Login failed.';
      alertEl.classList.remove('d-none');
    }
  } catch {
    alertEl.textContent = 'Network error. Is the backend running on port 3000?';
    alertEl.classList.remove('d-none');
  }
}

//  LOGOUT 
function logout() {
  sessionStorage.removeItem('authToken');
  setAuthState(false);
  showToast('Logged out successfully.', 'info');
  navigateTo('#/');
}

//  PROFILE (from server) 
async function renderProfile() {
  const container = document.getElementById('profile-content');
  container.innerHTML = '<p class="text-muted">Loading...</p>';

  try {
    const res  = await apiFetch('/api/profile');
    const data = await res.json();

    if (res.ok) {
      const u = data.user;
      container.innerHTML = `
        <div class="profile-avatar">${(u.username || 'U')[0].toUpperCase()}</div>
        <div class="profile-field">
          <label>Username</label><span>${u.username}</span>
        </div>
        <div class="profile-field">
          <label>Email</label><span>${u.email}</span>
        </div>
        <div class="profile-field">
          <label>Role</label>
          <span class="badge-${u.role}">${u.role.charAt(0).toUpperCase() + u.role.slice(1)}</span>
        </div>
      `;
    } else {
      container.innerHTML = '<p class="text-danger">Failed to load profile. Please log in again.</p>';
      if (res.status === 401 || res.status === 403) {
        sessionStorage.removeItem('authToken');
        setAuthState(false);
        navigateTo('#/login');
      }
    }
  } catch {
    container.innerHTML = '<p class="text-danger">Network error loading profile.</p>';
  }
}

//  ADMIN DASHBOARD 
async function loadAdminDashboard() {
  try {
    const res  = await apiFetch('/api/admin/dashboard');
    const data = await res.json();

    if (res.ok) {
      document.getElementById('content').innerText = data.message;
    } else {
      document.getElementById('content').innerText = 'Access denied!';
    }
  } catch {
    document.getElementById('content').innerText = 'Network error.';
  }
}

//  ROUTING 
const protectedRoutes = ['#/profile', '#/requests'];
const adminRoutes     = ['#/employees', '#/accounts', '#/departments'];

function navigateTo(hash) {
  window.location.hash = hash;
}

function handleRouting() {
  const hash = window.location.hash || '#/';

  if (protectedRoutes.includes(hash) && !currentUser) {
    navigateTo('#/login'); return;
  }
  if (adminRoutes.includes(hash)) {
    if (!currentUser) { navigateTo('#/login'); return; }
    if (currentUser.role !== 'admin') {
      showToast('Access denied: Admins only.', 'danger');
      navigateTo('#/'); return;
    }
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const routeMap = {
    '#/':           'home-page',
    '#/register':   'register-page',
    '#/login':      'login-page',
    '#/profile':    'profile-page',
    '#/employees':  'employees-page',
    '#/departments':'departments-page',
    '#/accounts':   'accounts-page',
    '#/requests':   'requests-page'
  };

  const pageId = routeMap[hash] || 'home-page';
  const page   = document.getElementById(pageId);
  if (page) page.classList.add('active');

  if (hash === '#/profile') renderProfile();
}

window.addEventListener('hashchange', handleRouting);

//  TOAST 
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const id = 'toast-' + Date.now();
  const div = document.createElement('div');
  div.innerHTML = `
    <div id="${id}" class="toast toast-${type} show align-items-center" role="alert">
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close me-2 m-auto" onclick="document.getElementById('${id}').remove()"></button>
      </div>
    </div>
  `;
  container.appendChild(div);
  setTimeout(() => { const el = document.getElementById(id); if (el) el.remove(); }, 3500);
}

//  RESTORE SESSION ON LOAD 
async function restoreSession() {
  const token = sessionStorage.getItem('authToken');
  if (!token) return;

  try {
    const res  = await apiFetch('/api/profile');
    const data = await res.json();
    if (res.ok) setAuthState(true, data.user);
    else sessionStorage.removeItem('authToken');
  } catch {
    // Backend not reachable — clear token
    sessionStorage.removeItem('authToken');
  }
}

//  INIT 
async function init() {
  await restoreSession();
  if (!window.location.hash) window.location.hash = '#/';
  handleRouting();
}

init();