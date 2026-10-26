'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Lead } from '@/lib/types';
import * as api from '@/lib/api';
import { useAuthUser } from '@/lib/useAuthUser';

interface AddLeadContextType {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
  leads: Lead[];
  loading: boolean;
  // Authoritative counts from the server (accurate regardless of the in-memory
  // list, which can be large/slow to load). Null until first fetched.
  stats: api.LeadStats | null;
  addLead: (lead: Lead) => void;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  deleteLead: (id: string) => void;
  addNote: (id: string, text: string, author?: string) => void;
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

  // Mirror of allLeads.length, kept in a ref so the poll can compare against it
  // without re-creating the interval on every list change.
  const countRef = useRef(0);
  const leadsRef = useRef<Lead[]>([]);
  useEffect(() => { countRef.current = allLeads.length; leadsRef.current = allLeads; }, [allLeads]);

  // Last-seen follow-up bucket signature. The overdue/today/followup buckets are
  // derived from each lead's follow-up date, so a lead can move (followup→today
  // →overdue, e.g. at midnight) WITHOUT the total changing. We must re-fetch the
  // list then too — otherwise the tab count (from fresh stats) shows leads but
  // the tab list (stale cached array) is empty.
  const bucketRef = useRef('');

  // Newest updatedAt we've seen + the local day of the last full load. Lets a
  // change be synced with a small ?since= fetch instead of the full list.
  const sinceRef = useRef('');
  const loadedDayRef = useRef('');
  // In-flight full load, so the first stats poll waits for it instead of
  // starting a second multi-MB download in parallel.
  const fullLoadRef = useRef<Promise<void> | null>(null);

  const maxUpdatedAt = (leads: Lead[], start = '') =>
    leads.reduce((m, l) => (l.updatedAt && l.updatedAt > m ? l.updatedAt : m), start);

  // Full (lean) list fetch — ~27k leads, several MB. Only on first load, at a
  // day change (follow-up buckets roll over) or when a delta can't reconcile.
  const refresh = useCallback(() => {
    if (fullLoadRef.current) return fullLoadRef.current;
    fullLoadRef.current = (async () => {
      try {
        const leads = await api.listLeads();
        setAllLeads(leads);
        countRef.current = leads.length;
        sinceRef.current = maxUpdatedAt(leads);
        loadedDayRef.current = new Date().toDateString();
      } catch {
        // Silent — keep showing the leads we already have.
      } finally {
        setLoading(false);
        fullLoadRef.current = null;
      }
    })();
    return fullLoadRef.current;
  }, []);

  // Fetch only leads created/changed since the last sync and merge them in.
  // Falls back to a full load if the result still doesn't match the server
  // total (e.g. someone else deleted leads).
  const syncChanges = useCallback(async (expectedTotal: number) => {
    if (!sinceRef.current || loadedDayRef.current !== new Date().toDateString()) {
      await refresh();
      return;
    }
    try {
      const changed = await api.listLeadsSince(sinceRef.current);
      sinceRef.current = maxUpdatedAt(changed, sinceRef.current);
      if (changed.length) {
        const byId = new Map(changed.map((l) => [l.id, l]));
        const updated = leadsRef.current.map((l) => {
          const c = byId.get(l.id);
          if (!c) return l;
          byId.delete(l.id);
          return { ...l, ...c };
        });
        const added = Array.from(byId.values()).sort((a, b) =>
          String(b.createdAt).localeCompare(String(a.createdAt)),
        );
        const next = added.length ? [...added, ...updated] : updated;
        leadsRef.current = next;
        countRef.current = next.length;
        setAllLeads(next);
      }
      if (countRef.current !== expectedTotal) await refresh();
    } catch {
      await refresh();
    }
  }, [refresh]);

  // Cheap, authoritative counts. Also the change detector: if the global total
  // or follow-up buckets changed, sync just the changed leads. Counts come from
  // here — never from counting the in-memory array — so they're always correct.
  const loadStats = useCallback(async () => {
    try {
      if (fullLoadRef.current) await fullLoadRef.current;
      const global = await api.getLeadStats();
      const bucketSig = `${global.overdue}-${global.today}-${global.followup}`;
      if (global.total !== countRef.current || bucketSig !== bucketRef.current) {
        await syncChanges(global.total);
      }
      bucketRef.current = bucketSig;
      // Don't show counts until we know who's logged in, otherwise an employee
      // briefly sees the admin's (global) numbers before auth finishes loading.
      if (!auth.role) { setStats(null); return; }
      setStats(scopeArg ? await api.getLeadStats(scopeArg) : global);
    } catch {
      // ignore transient errors (cold start / offline)
    }
  }, [syncChanges, scopeArg, auth.role]);

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
      setAllLeads((prev) => prev.map((l) => (l.id === id ? saved : l)));
    } catch (err) {
      console.error('Failed to update lead:', err);
      refresh();
    }
  };

  const deleteLead = async (id: string) => {
    setAllLeads((prev) => prev.filter((l) => l.id !== id));
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
      setAllLeads((prev) => prev.map((l) => (l.id === id ? saved : l)));
    } catch (err) {
      console.error('Failed to add note:', err);
      refresh();
    }
  };

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
      refresh,
      reloadStats: loadStats,
    }}>
      {children}
    </AddLeadContext.Provider>
  );
}

export const useAddLead = () => useContext(AddLeadContext);
