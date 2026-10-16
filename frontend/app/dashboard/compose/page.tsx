'use client';

import { useEffect, useState, useRef, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { sendersApi, emailsApi, Sender } from '@/lib/api';

interface Recipient { email: string; name: string; }

function SendLaterPopover({
  onSelect,
  onClose,
}: {
  onSelect: (iso: string) => void;
  onClose:  () => void;
}) {
  const [custom, setCustom] = useState('');
  const now      = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const presets = [
    { label: 'Tomorrow',       date: new Date(tomorrow.setHours(9, 0, 0, 0))  },
    { label: 'Tomorrow, 10:00 AM', date: new Date(new Date(tomorrow).setHours(10, 0, 0, 0)) },
    { label: 'Tomorrow, 11:00 AM', date: new Date(new Date(tomorrow).setHours(11, 0, 0, 0)) },
    { label: 'Tomorrow, 3:00 PM',  date: new Date(new Date(tomorrow).setHours(15, 0, 0, 0)) },
  ];

  return (
    <div className="absolute top-12 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-60 p-4">
      <p className="text-xs font-semibold text-gray-700 mb-3">Send Later</p>

      {/* Custom datetime */}
      <div className="flex items-center gap-2 mb-3">
        <input
          type="datetime-local"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:border-green-400"
        />
      </div>

      {/* Presets */}
      <div className="space-y-0.5 mb-4">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => { onSelect(p.date.toISOString()); onClose(); }}
            className="w-full text-left text-xs text-gray-600 hover:text-gray-900 py-1 px-1 hover:bg-gray-50 rounded transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">
          Cancel
        </button>
        <button
          onClick={() => {
            const iso = custom ? new Date(custom).toISOString() : presets[0].date.toISOString();
            onSelect(iso);
            onClose();
          }}
          className="text-xs font-medium border border-green-500 text-green-600 hover:bg-green-50 px-3 py-1 rounded-md transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function RecipientPill({ r, onRemove }: { r: Recipient; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-300 bg-white text-xs text-gray-700">
      {r.email}
      <button onClick={onRemove} className="text-gray-400 hover:text-gray-700 ml-0.5">
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}

export default function ComposePage() {
  const router   = useRouter();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [senders, setSenders]     = useState<Sender[]>([]);
  const [senderId, setSenderId]   = useState('');
  const [subject, setSubject]     = useState('');
  const [body, setBody]           = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [scheduledAt, setScheduledAt]       = useState('');
  const [showSendLater, setShowSendLater]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    sendersApi.list().then((s) => {
      setSenders(s);
      if (s.length) setSenderId(s[0].id);
    }).catch(() => {});
  }, []);

  // Parse "email,name" or bare email from input
  const parseAndAddRecipients = (raw: string) => {
    const lines = raw.split(/[\n,;]+/);
    const next: Recipient[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Try "name <email>" format
      const angleMatch = trimmed.match(/^(.+?)\s*<(.+?)>$/);
      if (angleMatch) {
        next.push({ name: angleMatch[1].trim(), email: angleMatch[2].trim() });
      } else if (trimmed.includes('@')) {
        // bare email
        const [emailPart, namePart] = trimmed.split(/\s+/, 2);
        next.push({ email: emailPart, name: namePart ?? emailPart.split('@')[0] });
      }
    }
    if (next.length) {
      setRecipients((prev) => {
        const existing = new Set(prev.map((r) => r.email));
        return [...prev, ...next.filter((r) => !existing.has(r.email))];
      });
      setRecipientInput('');
    }
  };

  const handleRecipientKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', 'Tab', ',', ';'].includes(e.key)) {
      e.preventDefault();
      if (recipientInput.trim()) parseAndAddRecipients(recipientInput);
    }
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      parseAndAddRecipients(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !body.trim() || recipients.length === 0) {
      setResult({ ok: false, message: 'Please fill in subject, body, and at least one recipient.' });
      return;
    }
    const iso = scheduledAt || new Date(Date.now() + 5000).toISOString();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await emailsApi.schedule({
        subject,
        body,
        recipients,
        scheduledAt: iso,
        ...(senderId ? { senderId } : {}),
      });
      setResult({ ok: true, message: `✓ Scheduled ${res.totalJobs} email(s). Batch ID: ${res.batchId}` });
      setTimeout(() => router.push('/dashboard/scheduled'), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to schedule.';
      setResult({ ok: false, message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 relative">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-sm font-semibold text-gray-900">Compose New Email</h1>

        <div className="ml-auto flex items-center gap-2">
          {/* Send Later button */}
          <div className="relative">
            <button
              onClick={() => setShowSendLater((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                scheduledAt
                  ? 'border-green-400 text-green-600 bg-green-50'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {scheduledAt
                ? new Date(scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                : 'Send Later'}
            </button>
            {showSendLater && (
              <SendLaterPopover onSelect={setScheduledAt} onClose={() => setShowSendLater(false)} />
            )}
          </div>

          {/* Send / Schedule button */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-1.5 rounded-md border border-green-500 text-green-600 text-xs font-semibold hover:bg-green-50 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Scheduling…' : scheduledAt ? 'Schedule' : 'Send'}
          </button>
        </div>
      </div>

      {/* Result banner */}
      {result && (
        <div className={`flex items-center gap-2 px-6 py-2.5 text-xs ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {result.message}
        </div>
      )}

      {/* Form body */}
      <div className="flex-1 px-16 py-6 space-y-4 max-w-3xl mx-auto w-full">
        {/* From */}
        <div className="flex items-center gap-4">
          <label className="w-16 text-xs text-gray-500 text-right flex-shrink-0">From</label>
          <select
            value={senderId}
            onChange={(e) => setSenderId(e.target.value)}
            className="flex-1 text-xs border-0 bg-gray-50 rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-green-300 text-gray-700"
          >
            {senders.length === 0 && <option value="">Auto-provision sender</option>}
            {senders.map((s) => (
              <option key={s.id} value={s.id}>{s.etherealEmail}</option>
            ))}
          </select>
        </div>

        {/* To — pill input */}
        <div className="flex items-start gap-4">
          <label className="w-16 text-xs text-gray-500 text-right flex-shrink-0 mt-1.5">To</label>
          <div className="flex-1 min-h-[36px] flex flex-wrap gap-1 items-center border-0 bg-transparent pb-1 border-b border-gray-100">
            {recipients.map((r, i) => (
              <RecipientPill key={i} r={r} onRemove={() => setRecipients((prev) => prev.filter((_, j) => j !== i))} />
            ))}
            <input
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              onKeyDown={handleRecipientKeyDown}
              onBlur={() => { if (recipientInput.trim()) parseAndAddRecipients(recipientInput); }}
              placeholder={recipients.length ? '' : 'recipient@example.com'}
              className="flex-1 min-w-[160px] text-xs outline-none placeholder-gray-400 text-gray-700 bg-transparent py-1"
            />
            {recipients.length > 4 && (
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                +{recipients.length - 4}
              </span>
            )}
          </div>
          {/* CSV upload */}
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-600 transition-colors whitespace-nowrap mt-1"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload List
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCSVUpload} className="hidden" />
        </div>

        {/* Subject */}
        <div className="flex items-center gap-4">
          <label className="w-16 text-xs text-gray-500 text-right flex-shrink-0">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 text-xs border-0 border-b border-gray-100 py-2 outline-none placeholder-gray-400 text-gray-800 bg-transparent focus:border-green-300"
          />
        </div>

        {/* Body */}
        <div className="mt-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            placeholder="Type Your Reply…"
            className="w-full text-sm text-gray-700 placeholder-gray-400 bg-gray-50 rounded-lg p-4 outline-none resize-none border border-gray-100 focus:border-green-300 focus:ring-1 focus:ring-green-100"
          />
        </div>
      </div>
    </div>
  );
}
