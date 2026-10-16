'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, X, Clock } from 'lucide-react';
import { emailsApi, EmailJob } from '@/lib/api';

function EmailReader({ job, onClose }: { job: EmailJob; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/20" onClick={onClose} />
      {/* Pane */}
      <div className="w-[580px] bg-white border-l border-gray-100 flex flex-col overflow-hidden animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
          <h2 className="font-semibold text-gray-900 text-sm truncate flex-1">
            {job.batch.subject}
          </h2>
        </div>

        {/* Meta */}
        <div className="px-6 py-4 border-b border-gray-50">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold">
              {job.recipientName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{job.recipientName}</p>
              <p className="text-xs text-gray-400">&lt;{job.recipientEmail}&gt;</p>
            </div>
            <span className="ml-auto text-xs text-gray-400">
              {new Date(job.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {job.batch.subject}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-600 text-xs font-medium">
              <Clock className="w-3 h-3" />
              Scheduled
            </span>
            <span className="text-xs text-gray-400">
              {new Date(job.scheduledAt).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScheduledPage() {
  const [jobs, setJobs]           = useState<EmailJob[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<EmailJob | null>(null);
  const [search, setSearch]       = useState('');

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await emailsApi.scheduled();
      setJobs(data);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchJobs(); }, [fetchJobs]);

  const filtered = jobs.filter(
    (j) =>
      j.batch.subject.toLowerCase().includes(search.toLowerCase()) ||
      j.recipientName.toLowerCase().includes(search.toLowerCase()) ||
      j.recipientEmail.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-md px-3 py-1.5 border border-gray-100">
          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
          />
        </div>
        <button
          onClick={fetchJobs}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
            <Clock className="w-8 h-8 mb-2 opacity-30" />
            {search ? 'No results found.' : 'No scheduled emails.'}
          </div>
        ) : (
          filtered.map((job) => (
            <button
              key={job.id}
              onClick={() => setSelected(job)}
              className="w-full flex items-center gap-4 px-6 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors text-left group"
            >
              <span className="w-28 text-xs font-semibold text-gray-800 truncate flex-shrink-0">
                To: {job.recipientName}
              </span>

              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-500 text-[10px] font-semibold whitespace-nowrap flex-shrink-0">
                  <Clock className="w-2.5 h-2.5" />
                  {new Date(job.scheduledAt).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-xs font-medium text-gray-800 truncate">{job.batch.subject}</span>
                <span className="text-xs text-gray-400 truncate hidden sm:block">· {job.recipientEmail}</span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Email Reader Drawer */}
      {selected && <EmailReader job={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
