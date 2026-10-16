'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Loader2, ExternalLink } from 'lucide-react';

// Inline Slack logo SVG (lucide-react doesn't ship a Slack icon)
function SlackLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 01-2.521 2.521 2.528 2.528 0 01-2.521-2.521V2.522A2.528 2.528 0 0115.167 0a2.528 2.528 0 012.521 2.522v6.312zm-2.521 10.123a2.528 2.528 0 012.521 2.522A2.528 2.528 0 0115.167 24a2.528 2.528 0 01-2.521-2.522v-2.522h2.521zm0-1.268a2.528 2.528 0 01-2.521-2.521 2.528 2.528 0 012.521-2.521h6.312A2.528 2.528 0 0124 15.167a2.528 2.528 0 01-2.522 2.521h-6.312z"/>
    </svg>
  );
}
import { useAuth } from '@/lib/auth-context';
import { sendersApi, slackApi, Sender } from '@/lib/api';

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const [senders, setSenders]           = useState<Sender[]>([]);
  const [loadingSenders, setLoadingSenders] = useState(true);
  const [disconnecting, setDisconnecting]   = useState(false);
  const [message, setMessage]           = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    sendersApi.list()
      .then((s) => setSenders(s))
      .catch(() => {})
      .finally(() => setLoadingSenders(false));
  }, []);

  // Check URL params from Slack OAuth callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('slack') === 'connected') {
      setMessage({ ok: true, text: 'Slack connected successfully!' });
      void refresh();
      window.history.replaceState({}, '', '/dashboard/settings');
    } else if (params.get('slack') === 'error') {
      setMessage({ ok: false, text: 'Slack connection failed. Please try again.' });
      window.history.replaceState({}, '', '/dashboard/settings');
    }
  }, [refresh]);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await slackApi.disconnect();
      setMessage({ ok: true, text: 'Slack disconnected.' });
      void refresh();
    } catch {
      setMessage({ ok: false, text: 'Failed to disconnect Slack.' });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8 max-w-2xl mx-auto w-full">
      <h1 className="text-base font-semibold text-gray-900 mb-6">Settings</h1>

      {/* Status banner */}
      {message && (
        <div className={`flex items-center gap-2 text-xs rounded-lg px-4 py-3 mb-5 ${message.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {message.text}
        </div>
      )}

      {/* Profile */}
      <section className="bg-gray-50 rounded-xl p-5 mb-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Profile</h2>
        <div className="flex items-center gap-3">
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-bold">
              {user?.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-400">{user?.email}</p>
          </div>
        </div>
      </section>

      {/* Slack Integration */}
      <section className="bg-gray-50 rounded-xl p-5 mb-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Slack Integration</h2>
        <p className="text-xs text-gray-500 mb-4">
          Connect your Slack workspace to receive rate-limit notifications when the hourly email limit is reached.
        </p>

        {user?.hasSlack ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-gray-700 font-medium">Slack connected</span>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => slackApi.connect()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4A154B] text-white text-xs font-semibold hover:bg-[#3b1040] transition-colors"
          >
            <SlackLogo className="w-3.5 h-3.5" />
            Connect Slack
          </button>
        )}
      </section>

      {/* Ethereal Senders */}
      <section className="bg-gray-50 rounded-xl p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
          Ethereal SMTP Senders
        </h2>
        {loadingSenders ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading senders…
          </div>
        ) : senders.length === 0 ? (
          <p className="text-xs text-gray-400">No senders provisioned yet. Compose an email to auto-provision one.</p>
        ) : (
          <div className="space-y-2">
            {senders.map((s) => (
              <div key={s.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{s.etherealEmail}</p>
                  <p className="text-[10px] text-gray-400">{s.host}:{s.port}</p>
                </div>
                <a
                  href="https://ethereal.email/login"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[10px] text-green-600 hover:underline"
                >
                  Preview <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bull Board link */}
      <section className="mt-5">
        <a
          href="http://localhost:4000/api/admin/queues"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-green-600 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Open Bull Board Queue Dashboard
        </a>
      </section>
    </div>
  );
}
