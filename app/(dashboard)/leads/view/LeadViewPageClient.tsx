'use client';

import { useState, useEffect } from 'react';
import { notFound, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Phone, Mail, MessageSquare, Send, X, Calendar,
  Trash2, Clock, Plus, User, IndianRupee, CheckCircle2,
} from 'lucide-react';
import { MOCK_USERS } from '@/lib/mockData';
import { STATUS_CONFIG } from '@/lib/constants';
import { LeadStatus, Lead } from '@/lib/types';
import { useAddLead } from '@/context/AddLeadContext';
import { useAuthUser } from '@/lib/useAuthUser';
import * as api from '@/lib/api';
import { getSchema, resolveField, MANUAL_SCHEMA } from '@/lib/formSchemas';
import { formatDate } from '@/lib/format';

/* ─── Predefined comment chips ─────────────────────────────────── */
const QUICK_COMMENTS = [
  'Disconnect the call.', 'Ekyc Error', 'Login done successfully',
  'Not Interested', 'Ekyc Pending', 'He will Share', 'Form filling pending',
  'We cant process amount refunded via pg', 'Payment pending', 'Picked',
  'Cancelled', 'Documents issue', 'Not interested',
  'Documents pending from client', 'Switch off', 'Not responding',
  'Texted to send documents',
];

/* ─── Small helpers ─────────────────────────────────────────────── */
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {/* select-all + cursor-text → a single click highlights the whole value
          so the user can press Ctrl+C to copy. Not editable. Displayed in
          uppercase per requirement; the underlying text node still holds the
          original casing so copy/paste yields the source string unchanged. */}
      <div
        className="w-full px-3 py-2.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl min-h-[42px] break-words select-all cursor-text uppercase hover:bg-white hover:border-gray-300 transition-colors"
      >
        {value}
      </div>
    </div>
  );
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-white text-sm font-semibold transition-opacity hover:opacity-90 ${color}`}
    >
      {label}
    </button>
  );
}

/* ─── Comment modal ─────────────────────────────────────────────── */
function CommentModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (text: string) => void }) {
  const [text, setText] = useState('');
  const [chips, setChips] = useState(QUICK_COMMENTS);
  const [newChip, setNewChip] = useState('');
  const [addingChip, setAddingChip] = useState(false);

  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    onClose();
  };

  const addChip = () => {
    if (!newChip.trim()) return;
    setChips((c) => [...c, newChip.trim()]);
    setNewChip('');
    setAddingChip(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg z-10 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Comment</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Quick chips */}
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c}
                onClick={() => setText((t) => t ? `${t} ${c}` : c)}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
              >
                {c}
              </button>
            ))}
            {addingChip ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newChip}
                  onChange={(e) => setNewChip(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addChip()}
                  placeholder="New chip…"
                  className="text-xs px-2 py-1.5 border border-blue-400 rounded-full focus:outline-none w-28"
                />
                <button onClick={addChip} className="text-xs bg-blue-600 text-white px-2 py-1.5 rounded-full">Add</button>
                <button onClick={() => setAddingChip(false)} className="text-xs text-gray-400 px-1">✕</button>
              </div>
            ) : (
              <button
                onClick={() => setAddingChip(true)}
                className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Textarea */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add your comment here"
            rows={4}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white resize-none transition-all"
          />
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-50">
          <button onClick={onClose} className="px-5 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
            Cancel
          </button>
          <button onClick={submit} className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors">
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Refund amount modal ──────────────────────────────────────── */
function RefundModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (amount: number) => void }) {
  const [amount, setAmount] = useState('');
  const value = Number(amount);
  const valid = amount.trim() !== '' && Number.isFinite(value) && value > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-rose-50 rounded-xl flex items-center justify-center">
              <IndianRupee className="w-4 h-4 text-rose-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Process Refund</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-5">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Refund amount (₹)</label>
          <input
            autoFocus
            type="number"
            min={1}
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
          <p className="text-xs text-gray-400 mt-2">A note will be added to the lead's activity feed for the audit trail.</p>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-50">
          <button onClick={onClose} className="px-5 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
            Cancel
          </button>
          <button
            disabled={!valid}
            onClick={() => { if (valid) { onSubmit(value); onClose(); } }}
            className="px-5 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            Confirm Refund
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Refund success modal ─────────────────────────────────────── */
/* Shown once after a refund is accepted by Paytm. Paytm may report the
   refund as "pending" (async processing) but the money is on its way back,
   so we present it as a single clean success — no "pending" wording. */
function RefundSuccessModal({ amount, onClose }: { amount: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10 overflow-hidden">
        <div className="p-6 flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" strokeWidth={2} />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Refund Successful</h3>
          <p className="text-sm text-gray-600 mt-1.5">
            ₹{amount.toLocaleString('en-IN')} has been refunded to the customer.
          </p>
          <button
            onClick={onClose}
            className="mt-5 w-full px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Follow-up date modal ──────────────────────────────────────── */
function FollowUpModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (date: string) => void }) {
  const [date, setDate] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Select Follow-up Date</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-5">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-50">
          <button onClick={onClose} className="px-5 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
            Close
          </button>
          <button
            onClick={() => { if (date) { onSubmit(date); onClose(); } }}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Confirm modal ─────────────────────────────────────────────── */
function ConfirmModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10 p-6 text-center">
        <p className="text-sm font-medium text-gray-700 mb-6">{message}</p>
        <div className="flex justify-center gap-3">
          <button onClick={onConfirm} className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors">
            OK
          </button>
          <button onClick={onCancel} className="px-6 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Website lead view ─────────────────────────────────────────── */
function WebsiteLeadView({ leadId }: { leadId: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { leads, updateLead, deleteLead, addNote, reloadStats } = useAddLead();
  const auth = useAuthUser();
  const isAdmin = auth.role === 'admin';
  // Refund + delete are admin-only, PLUS the specific employee Ganesh (per request).
  const mayRefund = isAdmin || auth.name === 'Ganesh';
  const mayDelete = isAdmin || auth.name === 'Ganesh';

  // The context list is lean (no formData) so the per-service form fields
  // aren't there. Fetch the full lead and merge it over the lean version once
  // it loads. (Hooks stay above the guard; the wrapper only renders this view
  // when the lead exists in context, so `lead` is always defined here.)
  const contextLead = leads.find((l) => l.id === leadId);
  const [fullLead, setFullLead] = useState<Lead | null>(null);
  useEffect(() => {
    let active = true;
    api.getLead(leadId).then((l) => { if (active) setFullLead(l); }).catch(() => {});
    return () => { active = false; };
  }, [leadId]);
  // Until the full lead arrives, the lean context lead has no notes/formData —
  // default them so the view never crashes reading `.length` / form fields.
  const baseLead = fullLead || contextLead;
  const lead = baseLead ? { ...baseLead, notes: baseLead.notes ?? [], formData: baseLead.formData ?? {} } : null;
  if (!lead) return notFound();

  const schema = lead.leadType === 'manual' ? MANUAL_SCHEMA : getSchema(lead);

  const [showComment, setShowComment] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [refundSuccess, setRefundSuccess] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; action: () => void } | null>(null);
  const [employees, setEmployees] = useState<string[]>(() =>
    MOCK_USERS.filter((u) => u.role === 'employee').map((u) => u.name)
  );

  useEffect(() => {
    const stored = localStorage.getItem('crm-users');
    if (stored) {
      const users = JSON.parse(stored);
      setEmployees(users.filter((u: { role: string }) => u.role === 'employee').map((u: { name: string }) => u.name));
    }
  }, []);

  const addComment = (text: string) => {
    // Author = whoever is currently logged in (admin or employee). A comment
    // should always be stamped with the user who actually wrote it, not the
    // person the lead happens to be assigned to.
    const author = auth.name || (auth.role === 'admin' ? 'Admin' : 'User');
    // Goes through the dedicated POST /api/leads/:id/notes endpoint, which
    // $pushes one note so the timestamps of older notes stay intact.
    addNote(lead.id, text, author);
    // The detail view renders `fullLead` (fetched separately), which addNote
    // doesn't touch — so optimistically append the note here too, otherwise it
    // only appears after a page refresh.
    setFullLead((prev) =>
      prev
        ? { ...prev, notes: [...(prev.notes ?? []), { id: `temp-${Date.now()}`, text, author, createdAt: new Date().toISOString() }] }
        : prev
    );
  };

  // The pipeline the user came from (passed as ?from= when they clicked the
  // lead in LeadTable). After any action that takes the lead off the detail
  // view — status change, follow-up, delete — we send them back to that exact
  // page+pagination, instead of jumping to the new status's pipeline.
  const fromParam = sp.get('from');
  const backUrl = fromParam || `/leads/${lead.status}`;

  // Hard-navigates back to the originating pipeline. router.replace was
  // racing with the unmount-after-optimistic-update; window.location is
  // deterministic and forces the table to refetch into the right page state.
  const goBack = () => {
    if (typeof window !== 'undefined') window.location.assign(backUrl);
    else router.replace(backUrl);
  };

  // We AWAIT the context methods (which await the backend PATCH/DELETE)
  // before navigating. Without the await the hard reload races the
  // outstanding network call — the destination page refetches the old data
  // and the lead "comes back" until you refresh again.

  const changeStatus = (newStatus: LeadStatus, label: string) => {
    setConfirm({
      message: `Are you sure you want to change status to ${label}?`,
      action: async () => {
        setConfirm(null);
        await updateLead(lead.id, { status: newStatus });
        goBack();
      },
    });
  };

  const handleFollowUp = async (date: string) => {
    setShowFollowUp(false);
    const n = new Date();
    const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    const status: LeadStatus = date < today ? 'overdue' : date === today ? 'today' : 'followup';
    await updateLead(lead.id, { status, followUpDate: date });
    goBack();
  };

  // Issue a Paytm refund. Calls the backend which talks to Paytm's
  // /refund/apply API; the money goes back to whichever payment instrument
  // the customer originally used (UPI/card/netbanking). The backend writes
  // a system note + updates the lead, so we just refetch into the local
  // context after a successful refund.
  const handleRefund = async (amount: number) => {
    try {
      const updated = await api.refundLead(lead.id, amount);
      // Context expects camelCase fields — backend already returns the lead
      // in the same shape; merge in the refund fields we care about for UI.
      // A failed refund throws (backend returns 400), so reaching here always
      // means the refund was accepted. Paytm may report "pending" for async
      // processing, but the money is refunded — show it as refunded, not pending.
      updateLead(lead.id, {
        refundAmount: updated.refundAmount ?? amount,
        refundStatus: updated.refundStatus === 'failed' ? 'failed' : 'refunded',
        notes: updated.notes,
      } as Partial<typeof lead>);
      // The detail view renders `fullLead`, so update it too — otherwise the
      // new refund system-note only appears after a page refresh.
      setFullLead((prev) => prev ? {
        ...prev,
        refundAmount: updated.refundAmount ?? amount,
        refundStatus: updated.refundStatus === 'failed' ? 'failed' : 'refunded',
        notes: updated.notes ?? prev.notes,
      } : prev);
      // Single clean success modal instead of a browser "pending" alert.
      setRefundSuccess(amount);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Refund failed';
      alert(`Refund failed: ${msg}`);
    }
  };

  const handleDelete = () => {
    setConfirm({
      message: 'Are you sure you want to delete this lead? This cannot be undone.',
      action: async () => {
        setConfirm(null);
        // Use the context delete so the lead is removed from the in-memory list
        // immediately — the list page then shows it gone the moment we go back
        // (no waiting for a poll). This view stays alive during the delete
        // because it renders from `fullLead` state, not the context list, so
        // removing it from context won't 404. Refresh the counts too.
        try { await deleteLead(lead.id); } catch (err) { console.error('Failed to delete lead:', err); }
        reloadStats();
        goBack();
      },
    });
  };

  const ALL_STATUSES: { label: string; status: LeadStatus; color: string; bg: string }[] = [
    { label: 'Follow Up',  status: 'followup',  color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200'    },
    { label: 'In Process', status: 'inprocess', color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200'  },
    { label: 'Converted',  status: 'converted', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200'},
    { label: 'Dead',       status: 'dead',      color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200'      },
  ];

  const cfg = STATUS_CONFIG[lead.status];
  const initials = (lead.name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  const WA_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z';

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-10">

      {/* ── Top nav bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link
          href={`/leads/${lead.status}`}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back to {cfg.label}</span>
        </Link>
        <span className="text-gray-200">/</span>
        <span className="text-sm font-medium text-gray-700 truncate">{lead.name || 'Lead'}</span>
      </div>

      {/* ── Hero card ──────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100">

        {/* Dark gradient header */}
        <div className="bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 px-6 pt-6 pb-5">

          {/* Status pill — pinned top-right, right above the profile so the
              lead's stage (New / Overdue / Follow Up …) is clear on mobile. */}
          <div className="flex justify-end mb-3">
            <span
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${cfg.bg} ${cfg.color} ${cfg.border}`}
            >
              {cfg.label}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start gap-4">

            {/* Avatar */}
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
              <span className="text-white text-lg font-bold">{initials}</span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div>
                <div>
                  <h1 className="text-xl font-bold text-white leading-tight uppercase">{lead.name || '—'}</h1>
                  <p className="text-slate-400 text-sm mt-0.5 uppercase">{lead.service}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
                    {lead.mobileNumber && (
                      <a href={`tel:${lead.mobileNumber}`} className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors uppercase">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />{lead.mobileNumber}
                      </a>
                    )}
                    {lead.email && (
                      <span className="flex items-center gap-1.5 text-sm text-slate-300 uppercase">
                        <Mail className="w-3.5 h-3.5 text-slate-500" />{lead.email}
                      </span>
                    )}
                    {lead.assignedTo && lead.assignedTo !== 'Unassigned' && (
                      <span className="flex items-center gap-1.5 text-sm text-slate-300 uppercase">
                        <User className="w-3.5 h-3.5 text-slate-500" />{lead.assignedTo}
                      </span>
                    )}
                    {/* Original creator — useful when admin reassigns later. */}
                    {lead.createdBy && lead.createdBy !== lead.assignedTo && (
                      <span className="flex items-center gap-1.5 text-sm text-slate-400 uppercase">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        Created by {lead.createdBy}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mt-5">
            {[
              { label: 'Amount',  value: lead.amount > 0 ? `₹${lead.amount.toLocaleString('en-IN')}` : '—' },
              {
                label: 'Payment',
                value:
                  lead.refundStatus === 'refunded' || lead.refundStatus === 'pending'
                    ? `Refunded ₹${(lead.refundAmount || 0).toLocaleString('en-IN')}`
                    : lead.paymentStatus === 'paid'
                        ? 'Paid'
                        : 'Unpaid',
              },
              { label: 'Source',  value: lead.source || '—' },
              { label: 'Date',    value: formatDate(lead.date) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/5 rounded-xl px-3 sm:px-3.5 py-2 sm:py-2.5 border border-white/10 min-w-0">
                <p className="text-[9px] sm:text-[10px] font-semibold text-slate-500 uppercase tracking-wide sm:tracking-widest">{label}</p>
                <p className="text-xs sm:text-sm font-semibold text-white mt-0.5 break-words uppercase">{value}</p>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── Body: form + sidebar ───────────────────────────────── */}
      <div>

        {/* Form fields */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-900">Lead Information</h2>
            <p className="text-xs text-gray-400 mt-0.5">Details submitted with this lead</p>
          </div>
          {/* One continuous grid (not row-by-row) so fields pack tightly and
              single fields like PAN Number / Transaction Id don't leave big
              empty gaps. Empty (null) layout cells are dropped. */}
          <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {schema.flat().filter(Boolean).map((fieldDef, i) => (
              <ReadOnlyField
                key={i}
                label={(fieldDef as { label: string }).label}
                value={resolveField(lead, fieldDef)}
              />
            ))}
          </div>
        </div>

      </div>

      {/* ── Action bar — sits above the comments list ─────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4 flex flex-wrap items-center gap-2.5">
        {/* Contact */}
        <a href={`tel:${lead.mobileNumber}`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold shadow-sm transition-all hover:shadow-md">
          <Phone className="w-3.5 h-3.5" /> Call
        </a>
        <a href={`https://wa.me/91${lead.mobileNumber}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#1fbc5a] text-white text-sm font-semibold shadow-sm transition-all hover:shadow-md">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white"><path d={WA_PATH} /></svg>
          WhatsApp
        </a>

        <div className="w-px h-5 bg-gray-200" />

        {/* Comment */}
        <button onClick={() => setShowComment(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 shadow-sm transition-all">
          <MessageSquare className="w-3.5 h-3.5" /> Comment
        </button>
        {/* Follow Up — hidden on dead & converted (terminal states) */}
        {lead.status !== 'dead' && lead.status !== 'converted' && (
          <button onClick={() => setShowFollowUp(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-700 hover:bg-amber-100 shadow-sm transition-all">
            <Calendar className="w-3.5 h-3.5" /> Follow Up
          </button>
        )}

        <div className="w-px h-5 bg-gray-200" />

        {/* Status changers — visibility rules:
            - Converted: terminal; no status-change buttons at all
            - Dead: only "Converted" is shown so the lead can be resurrected
            - All others: the standard set (with each button hiding its own current status) */}
        {lead.status !== 'inprocess' && lead.status !== 'dead' && lead.status !== 'converted' && (
          <button onClick={() => changeStatus('inprocess', 'In Process')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100">
            In Process
          </button>
        )}
        {lead.status !== 'converted' && (
          <button onClick={() => changeStatus('converted', 'Converted')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100">
            Converted
          </button>
        )}
        {lead.status !== 'dead' && lead.status !== 'converted' && (
          <button onClick={() => changeStatus('dead', 'Dead')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200">
            Dead
          </button>
        )}

        {/* Refund — admin-only (+ Ganesh). Clickable unless already refunded
            or mid-refund. Decision is based on refundStatus (NOT refundAmount):
            a FAILED attempt also records an amount, so keying off the amount
            would wrongly lock the button after a failure. */}
        {mayRefund && (() => {
          const alreadyRefunded = lead.refundStatus === 'refunded' || lead.refundStatus === 'pending';
          const canRefund = !alreadyRefunded;
          const label = alreadyRefunded ? 'Refunded' : 'Refund';
          const tooltip = alreadyRefunded
            ? `Already refunded ₹${(lead.refundAmount || 0).toLocaleString('en-IN')}`
            : 'Process a refund for this transaction';
          return (
            <button
              onClick={() => canRefund && setShowRefund(true)}
              disabled={!canRefund}
              title={tooltip}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold shadow-sm transition-all ${
                canRefund
                  ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer'
                  : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed opacity-60'
              }`}
            >
              <IndianRupee className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })()}

        {/* Delete — admin + Ganesh */}
        {mayDelete && (
          <div className="ml-auto">
            <button onClick={handleDelete} title="Delete lead"
              className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-all shadow-sm">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Activity feed — below the action buttons ──────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Activity</h2>
            {lead.notes.length > 0 && (
              <span className="text-[11px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full tabular-nums">
                {lead.notes.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowComment(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Comment
          </button>
        </div>

        {lead.notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2">
            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">No activity yet</p>
            <button onClick={() => setShowComment(true)} className="text-xs text-blue-600 font-medium hover:underline">Add first comment</button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {lead.notes.map((note) => (
              <div key={note.id} className="flex gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold text-slate-600">
                  {note.author[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1.5">
                    <span className="text-sm font-semibold text-gray-900">{note.author}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(note.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{note.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showComment  && <CommentModal  onClose={() => setShowComment(false)}  onSubmit={addComment} />}
      {showFollowUp && <FollowUpModal onClose={() => setShowFollowUp(false)} onSubmit={handleFollowUp} />}
      {showRefund   && <RefundModal   onClose={() => setShowRefund(false)}   onSubmit={handleRefund} />}
      {refundSuccess !== null && <RefundSuccessModal amount={refundSuccess} onClose={() => setRefundSuccess(null)} />}
      {confirm      && <ConfirmModal  message={confirm.message} onConfirm={confirm.action} onCancel={() => setConfirm(null)} />}
    </div>
  );
}

/* ─── Admin lead view (existing design) ────────────────────────── */
function ManualLeadView({ leadId }: { leadId: string }) {
  const { leads, updateLead } = useAddLead();
  const auth = useAuthUser();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return notFound();

  const [status, setStatus]         = useState<LeadStatus>(lead.status);
  const [assignedTo, setAssignedTo] = useState(lead.assignedTo);
  const [paymentStatus, setPaymentStatus] = useState(lead.paymentStatus);
  const [employees, setEmployees]   = useState<string[]>(() =>
    MOCK_USERS.filter((u) => u.role === 'employee').map((u) => u.name)
  );
  const [noteText, setNoteText] = useState('');
  const [notes, setNotes]       = useState(lead.notes);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('crm-users');
    if (stored) {
      const users = JSON.parse(stored);
      setEmployees(users.filter((u: { role: string }) => u.role === 'employee').map((u: { name: string }) => u.name));
    }
  }, []);

  const addNote = () => {
    if (!noteText.trim()) return;
    const author = auth.name || (auth.role === 'admin' ? 'Admin' : 'User');
    const note = { id: Date.now().toString(), text: noteText, author, createdAt: new Date().toISOString().split('T')[0] };
    setNotes((n) => [...n, note]);
    setNoteText('');
  };

  const handleSave = () => {
    updateLead(lead.id, { status, assignedTo, paymentStatus, notes });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const cfg = STATUS_CONFIG[status];

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href={`/leads/${lead.status}`} className="p-2 rounded-xl hover:bg-white border border-gray-200 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{lead.name}</h1>
          <p className="text-sm text-gray-500">Lead #{lead.id} · Added {formatDate(lead.createdAt)}</p>
        </div>
        <button onClick={handleSave} className="hidden sm:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          {saved ? '✓ Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xl font-bold">{lead.name[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900">{lead.name}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${paymentStatus === 'paid' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                    {paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Mobile',  value: lead.mobileNumber },
                { label: 'Email',   value: lead.email || '—' },
                { label: 'Address', value: lead.address || '—' },
                { label: 'Service', value: lead.service },
                { label: 'Source',  value: lead.source || '—' },
                { label: 'Date',    value: formatDate(lead.date) },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 font-medium">{label}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-gray-400" />
              Notes & Activity
            </h3>
            <div className="space-y-3 mb-4">
              {notes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No notes yet.</p>
              ) : notes.map((note) => (
                <div key={note.id} className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-800">{note.text}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    <span>{note.author} · {note.createdAt}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea
                placeholder="Add a note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white resize-none transition-all"
              />
              <button onClick={addNote} className="px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Update Status</h3>
            <div className="space-y-2">
              {(['new','overdue','today','followup','inprocess','converted','dead'] as LeadStatus[]).map((s) => {
                const c = STATUS_CONFIG[s];
                return (
                  <button key={s} onClick={() => setStatus(s)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                      status === s ? `${c.bg} ${c.color} ${c.border}` : 'text-gray-600 border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${c.dot} flex-shrink-0`} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Assigned To</h3>
            <select value={assignedTo || 'Unassigned'} onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 text-gray-700"
            >
              <option value="Unassigned">Select assigned user</option>
              {employees.map((emp) => <option key={emp} value={emp}>{emp}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Payment Status</h3>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setPaymentStatus('paid')}
                className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${paymentStatus === 'paid' ? 'bg-green-600 text-white border-green-600' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                Paid
              </button>
              <button onClick={() => setPaymentStatus('unpaid')}
                className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${paymentStatus === 'unpaid' ? 'bg-orange-500 text-white border-orange-500' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                Unpaid
              </button>
            </div>
          </div>

          <button onClick={handleSave} className="sm:hidden w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors">
            {saved ? '✓ Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Entry point ───────────────────────────────────────────────── */
export default function LeadViewPageClient() {
  // Read id from the URL's ?id query at runtime. Using a query string keeps
  // the route fully static (one HTML file at /leads/view) so any lead ID
  // works on any static host — no host-specific rewrites needed.
  const sp = useSearchParams();
  const id = sp.get('id') ?? '';
  const { leads, loading, rememberLead } = useAddLead();
  const lead = leads.find((l) => l.id === id);

  // Converted/dead leads aren't in the in-memory list until the full list has
  // downloaded (those tabs page on the server), so fetch this one directly.
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'missing'>('idle');
  const found = !!lead;
  useEffect(() => {
    if (found || loading || !id) return;
    let active = true;
    setFetchState('loading');
    api.getLead(id)
      .then((l) => { if (active) { rememberLead(l); setFetchState('idle'); } })
      .catch(() => { if (active) setFetchState('missing'); });
    return () => { active = false; };
  }, [found, loading, id, rememberLead]);

  // On a hard refresh the lead list is still being fetched from the backend, so
  // wait for it before deciding the lead doesn't exist — otherwise the page
  // would 404 every time it's reloaded.
  if (!lead) {
    if (loading || fetchState !== 'missing') {
      return (
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      );
    }
    notFound();
  }

  return <WebsiteLeadView leadId={id} />;
}
