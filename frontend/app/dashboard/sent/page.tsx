'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, X, Send, ExternalLink } from 'lucide-react';
import { emailsApi, EmailJob } from '@/lib/api';

function SentEmailReader({ job, onClose }: { job: EmailJob; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <div className="w-[580px] bg-white border-l border-gray-100 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
          <h2 className="font-semibold text-gray-900 text-sm truncate flex-1">
            {job.batch.subject}
          </h2>
        </div>

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
              {job.sentAt
                ? new Date(job.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                : '—'}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
              <Send className="w-3 h-3" />
              Sent
            </span>
            {job.sentAt && (
              <span className="text-xs text-gray-400">{new Date(job.sentAt).toLocaleString()}</span>
            )}
          </div>

          {job.messageId && (
            <p className="text-[11px] text-gray-400 font-mono break-all">
              Message-ID: {job.messageId}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SentPage() {
  const [jobs, setJobs]         = useState<EmailJob[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<EmailJob | null>(null);
  const [query, setQuery]       = useState('');
  const [searching, setSearching] = useState(false);

  const fetchSent = useCallback(async () => {
    setLoading(true);
    try {
      const data = await emailsApi.sent();
      setJobs(data);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSent(); }, [fetchSent]);

  // Full-text search via Elasticsearch
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) { void fetchSent(); return; }
    setSearching(true);
    try {
      const { results } = await emailsApi.search(query.trim());
      // Map ES results back to EmailJob shape (partial)
      setJobs(results as unknown as EmailJob[]);
    } catch {
      // fallback to client filter
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <form onSubmit={handleSearch} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <div className="flex-1 flex items-center gap-2 bg-gray-50 rounded-md px-3 py-1.5 border border-gray-100">
          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (!e.target.value) void fetchSent(); }}
            placeholder="Search sent emails…"
            className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
          />
          {searching && <div className="w-3.5 h-3.5 border border-gray-300 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
        </div>
        <button
          type="button"
          onClick={fetchSent}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </form>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
            <Send className="w-8 h-8 mb-2 opacity-30" />
            {query ? 'No results found.' : 'No sent emails yet.'}
          </div>
        ) : (
          jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => setSelected(job)}
              className="w-full flex items-center gap-4 px-6 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors text-left"
            >
              {/* Recipient */}
              <span className="w-28 text-xs font-semibold text-gray-800 truncate flex-shrink-0">
                To: {job.recipientName}
              </span>

              {/* Gray Sent badge + subject */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold whitespace-nowrap flex-shrink-0">
                  <Send className="w-2.5 h-2.5" />
                  Sent
                </span>
                <span className="text-xs font-medium text-gray-800 truncate">
                  {job.batch?.subject ?? 'Email'}
                </span>
                <span className="text-xs text-gray-400 truncate hidden sm:block">
                  · {job.recipientEmail}
                </span>
              </div>

              {/* Sent timestamp */}
              {job.sentAt && (
                <span className="text-[10px] text-gray-400 flex-shrink-0 hidden md:block">
                  {new Date(job.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}

              {/* Ethereal preview link */}
              {job.messageId && (
                <ExternalLink className="w-3 h-3 text-gray-300 hover:text-green-500 flex-shrink-0 transition-colors" />
              )}
            </button>
          ))
        )}
      </div>

      {selected && <SentEmailReader job={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
