const BASE = '/api';

function getSession() {
  try { return JSON.parse(sessionStorage.getItem('bebebills_session')); } catch { return null; }
}

async function handleError(res) {
  let msg;
  try { msg = (await res.json()).error; } catch { msg = await res.text(); }
  throw new Error(msg || 'Something went wrong');
}

async function request(method, path, body) {
  const session = getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.user_id) headers['X-User-Id'] = session.user_id;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) await handleError(res);
  return res.json();
}

async function requestBlob(method, path) {
  const session = getSession();
  const headers = {};
  if (session?.user_id) headers['X-User-Id'] = session.user_id;
  const res = await fetch(BASE + path, { method, headers });
  if (!res.ok) await handleError(res);
  return res.blob();
}

async function requestFormData(method, path, formData) {
  const session = getSession();
  const headers = {};
  if (session?.user_id) headers['X-User-Id'] = session.user_id;
  const res = await fetch(BASE + path, { method, headers, body: formData });
  if (!res.ok) await handleError(res);
  return res.json();
}

export const api = {
  get:        (path)           => request('GET', path),
  post:       (path, body)     => request('POST', path, body),
  put:        (path, body)     => request('PUT', path, body),
  delete:     (path)           => request('DELETE', path),
  getBlob:    (path)           => requestBlob('GET', path),
  postForm:   (path, formData) => requestFormData('POST', path, formData),
};
