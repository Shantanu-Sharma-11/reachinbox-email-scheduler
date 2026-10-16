import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  hasSlack: boolean;
}

export interface Sender {
  id: string;
  etherealEmail: string;
  host: string;
  port: number;
  createdAt: string;
}

export interface EmailJob {
  id: string;
  batchId: string;
  recipientEmail: string;
  recipientName: string;
  status: 'pending' | 'sent' | 'failed';
  scheduledAt: string;
  sentAt?: string;
  errorMessage?: string;
  messageId?: string;
  batch: {
    id: string;
    subject: string;
    scheduledAt: string;
    senderId: string;
  };
}

export interface SchedulePayload {
  subject: string;
  body: string;
  recipients: Array<{ email: string; name: string }>;
  scheduledAt: string;
  senderId?: string;
}

export const authApi = {
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  logout: () => api.get('/auth/logout').then((r) => r.data),
};

export const emailsApi = {
  scheduled: () => api.get<{ jobs: EmailJob[] }>('/api/emails/scheduled').then((r) => r.data.jobs),
  sent: () => api.get<{ jobs: EmailJob[] }>('/api/emails/sent').then((r) => r.data.jobs),
  search: (q: string) =>
    api.get<{ results: EmailJob[]; total: number }>(`/api/emails/search?q=${encodeURIComponent(q)}`).then((r) => r.data),
  schedule: (payload: SchedulePayload) =>
    api.post<{ success: boolean; batchId: string; totalJobs: number }>('/api/emails/schedule', payload).then((r) => r.data),
};

export const sendersApi = {
  list: () => api.get<{ senders: Sender[] }>('/api/senders').then((r) => r.data.senders),
};

export const slackApi = {
  connect: () => {
    window.location.href = `${API_BASE}/slack/connect`;
  },
  disconnect: () => api.delete('/slack/disconnect').then((r) => r.data),
};

export default api;
