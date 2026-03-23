const API = '/api';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  getStats: () => request('GET', '/stats'),
  getJobs: () => request('GET', '/stats/jobs'),
  getRegions: () => request('GET', '/regions'),
  addRegion: (data) => request('POST', '/regions', data),
  getBusinesses: (params) => {
    const qs = params ? new URLSearchParams(params).toString() : '';
    return request('GET', '/businesses' + (qs ? '?' + qs : ''));
  },
  getBusiness: (id) => request('GET', `/businesses/${id}`),
  addBusiness: (data) => request('POST', '/businesses', data),
  updateStage: (id, stage) => request('PATCH', `/businesses/${id}/stage`, { stage }),
  scanBusiness: (id) => request('POST', `/scan/${id}`),
  scanBatch: (ids) => request('POST', '/scan', { businessIds: ids }),
  generateReport: (id) => request('POST', `/reports/${id}`),
  publishReport: (id) => request('POST', `/reports/${id}/publish`),
  generateReportsBatch: (ids) => request('POST', '/reports', { businessIds: ids }),
  draftOutreach: (id) => request('POST', `/outreach/${id}/draft`),
  sendOutreach: (id, data) => request('POST', `/outreach/${id}/send`, data),
  logReply: (id, data) => request('POST', `/outreach/${id}/reply`, data),
  discover: (regionId) => request('POST', '/discover', { regionId }),
  getOnboarding: () => request('GET', '/clients'),
  generateScope: (id) => request('POST', `/clients/${id}/scope`),
  convertToClient: (id, data) => request('POST', `/clients/${id}/convert`, data),
  markPaid: (projectId) => request('POST', `/clients/projects/${projectId}/paid`),
};
