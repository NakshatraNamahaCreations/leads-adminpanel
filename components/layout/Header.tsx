'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Bell, Menu, ChevronDown, LogOut, UserCircle } from 'lucide-react';
import { useAuthUser } from '@/lib/useAuthUser';
import { useAddLead } from '@/context/AddLeadContext';
import * as api from '@/lib/api';
import type { Lead } from '@/lib/types';
import Link from 'next/link';
import ProfileModal from './ProfileModal';
import NotificationsModal from './NotificationsModal';

export default function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const [search, setSearch] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const { leads } = useAddLead();
  const [now, setNow] = useState<Date | null>(null);

  // Track which lead ids we've already shown so polling-driven refreshes only
  // ring a chime for genuinely new website leads (never on the very first
  // render — otherwise every existing lead would beep at page load).
  const seenLeadIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seenLeadIds.current === null) {
      seenLeadIds.current = new Set(leads.map((l) => l.id));
      return;
    }
    const fresh = leads.filter(
      (l) =>
        !seenLeadIds.current!.has(l.id) &&
        l.status === 'new' &&
        l.leadType !== 'manual',
    );
    if (fresh.length > 0) {
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          // If the tab was backgrounded the context may be suspended — resume
          // it so the chime is audible when the user is on a different tab.
          if (ctx.state === 'suspended') ctx.resume().catch(() => {});

          const playNote = (freq: number, startOffset: number, duration: number) => {
            const startAt = ctx.currentTime + startOffset;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, startAt);
            gain.gain.linearRampToValueAtTime(0.28, startAt + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
            osc.start(startAt);
            osc.stop(startAt + duration);
          };

          // Pleasant 3-note arpeggio (C5 → E5 → G5) — recognizable as a
          // notification chime even when the tab is in the background.
          playNote(523.25, 0,    0.40);
          playNote(659.25, 0.13, 0.40);
          playNote(783.99, 0.26, 0.55);
        }
      } catch {
        // Browser may block audio before the user interacts — silent fallback.
      }
    }
    seenLeadIds.current = new Set(leads.map((l) => l.id));
  }, [leads]);

  const handleLogout = () => {
    localStorage.removeItem('crm-auth');
    // Hard redirect (not router.push) so logout fires on the FIRST click and
    // all in-memory state + the lead-polling context is fully torn down.
    window.location.href = '/login';
  };

  const user = useAuthUser();
  const initials = user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dateStr = now?.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
  const timeStr = now?.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });

  // Searched on the server across ALL leads (the in-memory list only has the
  // open ones), 300ms after typing stops. Employees only find their own leads.
  const [results, setResults] = useState<Lead[]>([]);
  const [searching, setSearching] = useState(false);
  const searchScope = user.role && user.role !== 'admin' ? user.name : undefined;
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    let active = true;
    setSearching(true);
    const t = setTimeout(() => {
      api.searchLeads(q, 5, searchScope)
        .then((r) => { if (active) setResults(r); })
        .catch(() => { if (active) setResults([]); })
        .finally(() => { if (active) setSearching(false); });
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [search, searchScope]);

  const notifications = [
    ...leads
      .filter((l) => l.status === 'new')
      .map((l) => ({
        id: l.id,
        type: 'new' as const,
        message: `New lead — ${l.name}`,
        sub: l.service,
        href: `/leads/view?id=${l.id}`,
      })),
    ...leads
      .filter((l) => l.status === 'overdue')
      .map((l) => ({
        id: l.id,
        type: 'overdue' as const,
        message: `${l.name}'s follow-up is overdue`,
        sub: l.service,
        href: `/leads/view?id=${l.id}`,
      })),
    ...leads
      .filter((l) => l.status === 'today')
      .map((l) => ({
        id: l.id,
        type: 'today' as const,
        message: `Follow up with ${l.name} today`,
        sub: l.service,
        href: `/leads/view?id=${l.id}`,
      })),
  ];

  return (
    <>
      <header className="h-20 bg-white border-b border-gray-100 flex items-center px-5 gap-4 sticky top-0 z-20 flex-shrink-0">

        <button onClick={onMenuToggle} className="lg:hidden p-2 rounded-xl hover:bg-gray-100 transition-colors -ml-1">
          <Menu className="w-5 h-5 text-gray-600" />
        </button>

        <div className="flex-1 max-w-sm relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowResults(true); }}
            onFocus={() => search.length > 1 && setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 250)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all placeholder-gray-400"
          />
          {showResults && search.length > 1 && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden z-50">
              {results.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/view?id=${lead.id}`}
                  // Prevent the input's onBlur from firing first and hiding this
                  // dropdown before the click registers (the "click sometimes
                  // does nothing" bug).
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setSearch(''); setShowResults(false); }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{lead.name[0]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{lead.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {lead.mobileNumber} · {lead.service}
                      {lead.orderId ? ` · ${lead.orderId}` : ''}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {showResults && search.length > 1 && results.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden z-50">
              <p className="px-4 py-3 text-sm text-gray-400 text-center">{searching ? 'Searching…' : 'No leads found'}</p>
            </div>
          )}
        </div>

        {/* Right cluster — date/time chip + action icons, pinned to the corner */}
        <div className="flex items-center gap-3 ml-auto">

          {now && (
            <div className="hidden lg:flex items-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50 px-4 py-2 rounded-xl border border-blue-100">
              <span>{dateStr}</span>
              <span className="text-blue-300">·</span>
              <span className="tabular-nums">{timeStr}</span>
            </div>
          )}

          <div className="flex items-center gap-2">

          {/* <Link href="/settings" className="hidden lg:block p-2.5 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
            <Settings className="w-[18px] h-[18px]" />
          </Link> */}

          {/* Bell / mini dropdown — visible on all screens */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications((v) => !v)}
              className="relative p-2.5 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
            >
              <Bell className="w-[18px] h-[18px]" />
              {notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 bg-red-500 rounded-full border-2 border-white flex items-center justify-center">
                  <span className="text-[9px] font-bold text-white leading-none px-0.5">
                    {notifications.length > 9 ? '9+' : notifications.length}
                  </span>
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute top-full right-0 mt-2 w-[calc(100vw-6rem)] max-w-[20rem] sm:w-80 bg-white rounded-2xl border border-gray-100 shadow-xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                  <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
                  <span className="text-xs text-gray-400">{notifications.length} pending</span>
                </div>
                {notifications.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-gray-400 text-center">All caught up!</p>
                ) : (
                  <>
                    <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                      {notifications.slice(0, 4).map((n) => (
                        <Link
                          key={n.id}
                          href={n.href}
                          onClick={() => setShowNotifications(false)}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                        >
                          <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.type === 'overdue' ? 'bg-red-500' : 'bg-orange-400'}`} />
                          <div className="min-w-0">
                            <p className="text-sm text-gray-800 font-medium leading-snug">{n.message}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{n.sub}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                    <div className="border-t border-gray-50">
                      <button
                        onClick={() => { setShowNotifications(false); setShowNotifModal(true); }}
                        className="flex items-center justify-center w-full py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        View all notifications
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Avatar + profile dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setShowProfile((v) => !v)}
              className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl hover:bg-gray-50 border border-gray-100 hover:border-gray-200 transition-all"
            >
              <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">{initials}</span>
              </div>
              <span className="hidden sm:block text-sm font-semibold text-gray-700">{user.name.split(' ')[0]}</span>
              <ChevronDown className={`hidden sm:block w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${showProfile ? 'rotate-180' : ''}`} />
            </button>

            {showProfile && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-2xl border border-gray-100 shadow-xl z-50 overflow-hidden">
                <div className="p-4 border-b border-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-200">
                      <span className="text-white text-sm font-bold">{initials}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{user.name}</p>
                      <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      <span className="inline-block mt-1 text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full capitalize">
                        {user.role}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="p-2 space-y-0.5">
                  <button
                    onClick={() => { setShowProfile(false); setShowProfileModal(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors group"
                  >
                    <UserCircle className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                    <span className="flex-1 text-left">My Profile</span>
                  </button>
                </div>
                <div className="px-2 pb-2">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          </div>

        </div>
      </header>

      {showProfileModal && <ProfileModal onClose={() => setShowProfileModal(false)} />}
      {showNotifModal && (
        <NotificationsModal
          notifications={notifications}
          onClose={() => setShowNotifModal(false)}
        />
      )}
    </>
  );
}
