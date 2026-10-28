'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Lead } from '@/lib/types';
import * as api from '@/lib/api';
import { useAuthUser } from '@/lib/useAuthUser';

// The context holds only the OPEN leads (everything except converted/dead —
// a few hundred rows). Converted/dead are paged from the server by their own
// tabs, and the dashboard charts / header search query the server, so the
// panel never downloads all ~28k leads.
const CLOSED_STATUSES = ['converted', 'dead'];

interface AddLeadContextType {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
  leads: Lead[];
  loading: boolean;
  // Authoritative counts from the server (the in-memory list only has the
  // open leads). Null until first fetched.
  stats: api.LeadStats | null;
  addLead: (lead: Lead) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  deleteLead: (id: string) => void;
  addNote: (id: string, text: string, author?: string) => void;
  // Add a lead fetched on its own (e.g. a dead lead opened from its server-
  // paged tab or the header search) so the detail view can use it.
  rememberLead: (lead: Lead) => void;
  refresh: () => void;
  // Re-fetch the authoritative counts immediately (e.g. right after a delete)
  // so the sidebar/dashboard numbers update without waiting for the 10s poll.
  reloadStats: () => void;
}

const AddLeadContext = createContext<AddLeadContextType>({
  open: false,
  openModal: () => {},
  closeModal: () => {},
  leads: [],
  loading: true,
  stats: null,
  addLead: () => {},
  updateLead: () => {},
  deleteLead: () => {},
  addNote: () => {},
  rememberLead: () => {},
  refresh: () => {},
  reloadStats: () => {},
});

export function AddLeadProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuthUser();
  const [open, setOpen] = useState(false);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<api.LeadStats | null>(null);

  // Employees see only their own counts; admins see the whole pipeline.
  const scopeArg = auth.role && auth.role !== 'admin' ? auth.name : undefined;

  // Closed leads opened individually (see rememberLead). Kept across refreshes
  // so an open detail view doesn't lose its lead when the open list reloads.
  const closedExtrasRef = useRef<Map<string, Lead>>(new Map());
  const trackClosed = (lead: Lead) => {
    if (CLOSED_STATUSES.includes(lead.status)) closedExtrasRef.current.set(lead.id, lead);
    else closedExtrasRef.current.delete(lead.id);
  };

  // Fetch the open leads (~20 KB). Shared while in flight.
  const loadRef = useRef<Promise<void> | null>(null);
  const refresh = useCallback(() => {
    if (loadRef.current) return loadRef.current;
    loadRef.current = (async () => {
      try {
        const active = await api.listActiveLeads();
        const ids = new Set(active.map((l) => l.id));
        const extras = Array.from(closedExtrasRef.current.values()).filter((l) => !ids.has(l.id));
        setAllLeads([...active, ...extras]);
      } catch {
        // Silent — keep showing the leads we already have.
      } finally {
        setLoading(false);
        loadRef.current = null;
      }
    })();
    return loadRef.current;
  }, []);

  // Cheap, authoritative counts. Also the change detector: any change in the
  // counts (a new lead, a status change, follow-up buckets rolling over at
  // midnight) re-fetches the small open-leads list.
  const statsSigRef = useRef('');
  const loadStats = useCallback(async () => {
    try {
      const global = await api.getLeadStats();
      const sig = JSON.stringify(global);
      if (statsSigRef.current && sig !== statsSigRef.current) await refresh();
      statsSigRef.current = sig;
      // Don't show counts until we know who's logged in, otherwise an employee
      // briefly sees the admin's (global) numbers before auth finishes loading.
      if (!auth.role) { setStats(null); return; }
      setStats(scopeArg ? await api.getLeadStats(scopeArg) : global);
    } catch {
      // ignore transient errors (cold start / offline)
    }
  }, [refresh, scopeArg, auth.role]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { loadStats(); }, [loadStats]);

  // Poll the cheap stats every 10s (drives counts + new-lead chime).
  useEffect(() => {
    const id = setInterval(() => { loadStats(); }, 10_000);
    return () => clearInterval(id);
  }, [loadStats]);

  // Background tabs throttle timers — re-check on focus.
  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadStats();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
      return () => document.removeEventListener('visibilitychange', onVisible);
    }
  }, [loadStats]);

  const addLead = async (lead: Lead) => {
    try {
      const created = await api.createLead(lead);
      setAllLeads((prev) => [created, ...prev]);
    } catch (err) {
      console.error('Failed to add lead:', err);
    }
  };

  // Optimistic update, then reconcile with the saved document. On failure we
  // re-fetch so the UI never drifts from the backend.
  const updateLead = async (id: string, updates: Partial<Lead>) => {
    setAllLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
    try {
      const saved = await api.updateLead(id, updates);
      trackClosed(saved);
      setAllLeads((prev) => prev.map((l) => (l.id === id ? saved : l)));
    } catch (err) {
      console.error('Failed to update lead:', err);
      refresh();
    }
  };

  const deleteLead = async (id: string) => {
    setAllLeads((prev) => prev.filter((l) => l.id !== id));
    closedExtrasRef.current.delete(id);
    try {
      await api.deleteLead(id);
    } catch (err) {
      console.error('Failed to delete lead:', err);
      refresh();
    }
  };

  // Append a single note via the backend's $push endpoint. Existing notes'
  // timestamps are preserved (a full PATCH of the notes array would rewrite
  // them when Mongoose recreates the subdocuments).
  const addNote = async (id: string, text: string, author = 'Admin') => {
    try {
      const saved = await api.addLeadNote(id, text, author);
      trackClosed(saved);
      setAllLeads((prev) => prev.map((l) => (l.id === id ? saved : l)));
    } catch (err) {
      console.error('Failed to add note:', err);
      refresh();
    }
  };

  const rememberLead = useCallback((lead: Lead) => {
    trackClosed(lead);
    setAllLeads((prev) => (prev.some((l) => l.id === lead.id) ? prev : [lead, ...prev]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Until auth loads (role === ''), show NOTHING — otherwise an employee
  // flashes the full admin list for a moment. Admin → everything;
  // employee → only their own leads.
  const leads = !auth.role
    ? []
    : auth.role === 'admin'
      ? allLeads
      : allLeads.filter((l) => l.assignedTo === auth.name);

  return (
    <AddLeadContext.Provider value={{
      open,
      openModal: () => setOpen(true),
      closeModal: () => setOpen(false),
      leads,
      loading,
      stats,
      addLead,
      updateLead,
      deleteLead,
      addNote,
      rememberLead,
      refresh,
      reloadStats: loadStats,
    }}>
      {children}
    </AddLeadContext.Provider>
  );
}

export const useAddLead = () => useContext(AddLeadContext);
