import type { Lead, User, Blog, Career } from './types';

// Base URL of the MMD backend. Override with NEXT_PUBLIC_API_URL in production.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.makemydocuments.com';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.message || `Request failed (${res.status})`);
  }
  return data as T;
}

// Only open leads (everything except dead/converted) — a few hundred rows, so
// the panel can render its working lists before the full list arrives.
export async function listActiveLeads(): Promise<Lead[]> {
  const data = await request<{ data: Lead[] }>('/leads?active=1');
  return data.data;
}

export interface LeadPageQuery {
  status: 'converted' | 'dead';
  page?: number;
  limit?: number;
  search?: string;
  payment?: string;
  service?: string;
  country?: string;
  assignedTo?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  // Every match instead of one page (CSV export).
  all?: boolean;
}

export interface LeadPage {
  total: number;
  data: Lead[];
  // Distinct assignees in this status (for the staff filter).
  assignees: string[];
}

// One server-filtered page of a closed tab (converted/dead). Those tabs hold
// ~27k leads, so they're paged on the server rather than loaded whole.
export async function listLeadsPage(query: LeadPageQuery): Promise<LeadPage> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === '' || v === false) continue;
    qs.set(k, v === true ? '1' : String(v));
  }
  return request<LeadPage>(`/leads/page?${qs}`);
}

// Header search: the top few matches across ALL leads (name, mobile, order id,
// email, service), searched on the server.
export async function searchLeads(q: string, limit = 5, assignedTo?: string): Promise<Lead[]> {
  const qs = new URLSearchParams({ search: q, limit: String(limit) });
  if (assignedTo) qs.set('assignedTo', assignedTo);
  const data = await request<{ data: Lead[] }>(`/leads?${qs}`);
  return data.data;
}

// Dashboard chart data, aggregated on the server.
// Leads created per IST day ("YYYY-MM-DD").
export async function getDailyCounts(assignedTo?: string): Promise<{ d: string; n: number }[]> {
  const qs = assignedTo ? `?assignedTo=${encodeURIComponent(assignedTo)}` : '';
  const data = await request<{ data: { d: string; n: number }[] }>(`/leads/daily-counts${qs}`);
  return data.data;
}

// Leads + conversions per service, optionally within a date range.
export async function getServiceStats(
  opts: { from?: string; to?: string; assignedTo?: string } = {},
): Promise<{ name: string; count: number; converted: number }[]> {
  const qs = new URLSearchParams();
  if (opts.from) qs.set('from', opts.from);
  if (opts.to) qs.set('to', opts.to);
  if (opts.assignedTo) qs.set('assignedTo', opts.assignedTo);
  const data = await request<{ data: { name: string; count: number; converted: number }[] }>(
    `/leads/service-stats?${qs}`,
  );
  return data.data;
}

// Full single lead (includes formData, which the list endpoint omits for size).
// The detail view uses this so it can show every per-service form field.
export async function getLead(id: string): Promise<Lead> {
  const data = await request<{ data: Lead }>(`/leads/${id}`);
  return data.data;
}

export interface LeadStats {
  new: number; overdue: number; today: number; followup: number;
  inprocess: number; converted: number; dead: number; total: number;
}

// Cheap, authoritative counts (computed server-side). Used both to detect new
// leads (without re-downloading the whole list) and to drive the dashboard /
// tab counts so they're always correct regardless of the in-memory list.
// Pass assignedTo to scope counts to one employee.
export async function getLeadStats(assignedTo?: string): Promise<LeadStats> {
  const qs = assignedTo ? `?assignedTo=${encodeURIComponent(assignedTo)}` : '';
  const data = await request<{ data: LeadStats }>(`/leads/stats${qs}`);
  return data.data;
}

export async function createLead(payload: Partial<Lead>): Promise<Lead> {
  const data = await request<{ data: Lead }>('/leads', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.data;
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
  const data = await request<{ data: Lead }>(`/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.data;
}

export async function deleteLead(id: string): Promise<void> {
  await request(`/leads/${id}`, { method: 'DELETE' });
}

// Pushes a single note onto the lead — leaves existing notes (and their
// timestamps) untouched, unlike a full PATCH of the notes array.
export async function addLeadNote(id: string, text: string, author = 'Admin'): Promise<Lead> {
  const data = await request<{ data: Lead }>(`/leads/${id}/notes`, {
    method: 'POST',
    body: JSON.stringify({ text, author }),
  });
  return data.data;
}

// Issue a Paytm refund. Backend calls Paytm's /refund/apply API and returns
// the updated lead with refundStatus set. Throws on failure with Paytm's
// error message so the UI can show it.
export async function refundLead(leadId: string, amount: number): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/PG/paytm/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId, amount }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Refund failed');
  }
  return data.lead as Lead;
}

/* ── Users ─────────────────────────────────────────────── */

export async function listUsers(): Promise<User[]> {
  const data = await request<{ data: User[] }>('/users');
  return data.data;
}

export async function createUser(payload: Partial<User>): Promise<User> {
  const data = await request<{ data: User }>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.data;
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User> {
  const data = await request<{ data: User }>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.data;
}

export async function deleteUser(id: string): Promise<void> {
  await request(`/users/${id}`, { method: 'DELETE' });
}

export async function login(username: string, password: string): Promise<User> {
  const data = await request<{ data: User }>('/users/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return data.data;
}

/* ── Blogs ─────────────────────────────────────────────── */
// The backend stores the article body as `content`; the admin UI calls it
// `description`. These helpers translate between the two shapes.

type ApiBlog = Omit<Blog, 'description'> & { content?: string };

function fromApiBlog(b: ApiBlog): Blog {
  const { content, ...rest } = b;
  return { ...(rest as Omit<Blog, 'description'>), description: content ?? '' };
}

function toApiBlog(b: Partial<Blog>): Record<string, unknown> {
  const { description, ...rest } = b;
  return {
    ...rest,
    ...(description !== undefined ? { content: description } : {}),
  };
}

export async function listBlogs(): Promise<Blog[]> {
  const data = await request<{ data: ApiBlog[] }>('/blogs');
  return data.data.map(fromApiBlog);
}

export async function createBlog(payload: Partial<Blog>): Promise<Blog> {
  const data = await request<{ data: ApiBlog }>('/blogs', {
    method: 'POST',
    body: JSON.stringify(toApiBlog(payload)),
  });
  return fromApiBlog(data.data);
}

export async function updateBlog(id: string, updates: Partial<Blog>): Promise<Blog> {
  const data = await request<{ data: ApiBlog }>(`/blogs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(toApiBlog(updates)),
  });
  return fromApiBlog(data.data);
}

export async function deleteBlog(id: string): Promise<void> {
  await request(`/blogs/${id}`, { method: 'DELETE' });
}

/* ── Careers ────────────────────────────────────────────── */

export async function listCareers(): Promise<Career[]> {
  const data = await request<{ data: Career[] }>('/careers');
  return data.data;
}

export async function createCareer(payload: Partial<Career>): Promise<Career> {
  const data = await request<{ data: Career }>('/careers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.data;
}

export async function updateCareer(id: string, updates: Partial<Career>): Promise<Career> {
  const data = await request<{ data: Career }>(`/careers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.data;
}

export async function deleteCareer(id: string): Promise<void> {
  await request(`/careers/${id}`, { method: 'DELETE' });
}
