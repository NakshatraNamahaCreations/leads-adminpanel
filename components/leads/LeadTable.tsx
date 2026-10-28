'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, Filter, Trash2, Download, CheckCircle } from 'lucide-react';
import { Lead } from '@/lib/types';
import { MOCK_USERS } from '@/lib/mockData';
import * as api from '@/lib/api';
import { SERVICES, VISA_COUNTRIES, isTouristVisa, visaCountryOf } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import { useAddLead } from '@/context/AddLeadContext';
import { useAuthUser } from '@/lib/useAuthUser';
import PaymentBadge from './PaymentBadge';
import ServiceBadge from './ServiceBadge';
import Pagination from '../Pagination';

const PAGE_SIZE = 10;

interface Props {
  leads?: Lead[];
  // Set for the converted/dead tabs (~27k leads): rows are fetched one page at
  // a time from the server, with filters/sort applied there, instead of
  // filtering `leads` in the browser.
  serverStatus?: 'converted' | 'dead';
}

export default function LeadTable({ leads = [], serverStatus }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { deleteLead, updateLead, reloadStats } = useAddLead();
  // Only admins may (re)assign a lead. Employees see the assigned name as
  // read-only text — the dropdown is hidden for them.
  const auth = useAuthUser();
  const isAdmin = auth.role === 'admin';
  // Delete (select + bulk delete) is admin-only PLUS the employee Ganesh.
  const mayDelete = isAdmin || auth.name === 'Ganesh';
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof Lead>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  // Second dropdown, shown only when Service = Tourist Visa.
  const [visaCountryFilter, setVisaCountryFilter] = useState<string>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState<number | null>(null);
  // Pagination is mirrored to `?page=N` so a browser-back from a lead detail
  // page (or a manual refresh) lands the user on the same page they were on.
  const initialPage = Math.max(1, Number(searchParams.get('page')) || 1);
  const [page, setPage] = useState(initialPage);

  // Sync `page` → URL in an effect (not inside setState) so we never call
  // router.replace mid-render — doing that updates Link subscribers while
  // LeadTable is still rendering and throws "Cannot update LinkComponent".
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const urlPage = Math.max(1, Number(params.get('page')) || 1);
    if (urlPage === page) return;
    if (page <= 1) params.delete('page');
    else params.set('page', String(page));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [page, pathname, router, searchParams]);

  // Pick up external URL changes (back/forward, manual edit).
  useEffect(() => {
    const p = Math.max(1, Number(searchParams.get('page')) || 1);
    setPage((prev) => (prev === p ? prev : p));
  }, [searchParams]);
  const [employees, setEmployees] = useState<string[]>(() =>
    MOCK_USERS.filter((u) => u.role === 'employee').map((u) => u.name)
  );

  useEffect(() => {
    // 1. Seed from localStorage immediately so the dropdown isn't empty
    //    on first paint.
    const stored = localStorage.getItem('crm-users');
    if (stored) {
      try {
        const cached = JSON.parse(stored);
        setEmployees(
          cached.filter((u: { role: string }) => u.role === 'employee').map((u: { name: string }) => u.name),
        );
      } catch {
        // ignore bad cache
      }
    }
    // 2. Then refresh from the API so a freshly-added employee shows up
    //    without needing the user to visit the team settings page first.
    api.listUsers()
      .then((fresh) => {
        localStorage.setItem('crm-users', JSON.stringify(fresh));
        setEmployees(fresh.filter((u) => u.role === 'employee').map((u) => u.name));
      })
      .catch(() => {/* keep cached / mock list */});
  }, []);

  const allFilteredIds = (f: Lead[]) => new Set(f.map((l) => l.id));
  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleSelectAll = (filteredLeads: Lead[]) => {
    const ids = filteredLeads.map(l => l.id);
    const allSelected = ids.every(id => selected.has(id));
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
    }
  };
  const deleteSelected = () => setConfirmDeleteOpen(true);
  const confirmDeleteSelected = async () => {
    const ids = [...selected];
    setSelected(new Set());
    setConfirmDeleteOpen(false);
    // Delete in small batches so a large selection doesn't fire hundreds of
    // requests at once. Each deleteLead() removes the row optimistically and,
    // on the rare failure, re-fetches — so the list reflects the deletion
    // immediately. We deliberately do NOT re-fetch the whole list here: the
    // server keeps a short-lived cache, and a re-fetch a split second after the
    // delete can return the just-removed lead and make it "reappear".
    const BATCH = 10;
    for (let i = 0; i < ids.length; i += BATCH) {
      await Promise.all(ids.slice(i, i + BATCH).map((id) => deleteLead(id)));
    }
    // Update the sidebar/dashboard counts immediately (the rows are already
    // gone via the optimistic removal above), then show a success modal.
    reloadStats();
    if (serverStatus) setReloadKey((k) => k + 1);
    setDeleteSuccess(ids.length);
  };

  // ── Server-paged mode (serverStatus set) ──
  const [serverRows, setServerRows] = useState<Lead[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverAssignees, setServerAssignees] = useState<string[]>([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverLoaded, setServerLoaded] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  // Don't hit the server on every keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Employees only ever see their own leads (same rule as the context list).
  const scopeAssignee = auth.role && !isAdmin ? auth.name : undefined;
  const serverQuery = useMemo<api.LeadPageQuery | null>(() => {
    if (!serverStatus || !auth.role) return null;
    return {
      status: serverStatus,
      search: debouncedSearch.trim(),
      payment: paymentFilter === 'all' ? undefined : paymentFilter,
      service: serviceFilter === 'all' ? undefined : serviceFilter,
      country: serviceFilter === 'Tourist Visa' && visaCountryFilter !== 'all' ? visaCountryFilter : undefined,
      assignedTo: scopeAssignee ?? (assignedFilter === 'all' ? undefined : assignedFilter),
      sort: String(sortKey),
      dir: sortDir,
    };
  }, [serverStatus, auth.role, scopeAssignee, debouncedSearch, paymentFilter, serviceFilter, visaCountryFilter, assignedFilter, sortKey, sortDir]);

  useEffect(() => {
    if (!serverQuery) return;
    let active = true;
    setServerLoading(true);
    api.listLeadsPage({ ...serverQuery, page, limit: PAGE_SIZE })
      .then((r) => {
        if (!active) return;
        setServerRows(r.data);
        setServerTotal(r.total);
        setServerAssignees(r.assignees);
        setServerError(false);
        setServerLoaded(true);
      })
      .catch(() => { if (active) setServerError(true); })
      .finally(() => { if (active) setServerLoading(false); });
    return () => { active = false; };
  }, [serverQuery, page, reloadKey]);

  // Assign from the table. In server mode the rows live here, not in the
  // context list, so patch them too.
  const assignLead = (id: string, assignedTo: string) => {
    updateLead(id, { assignedTo });
    if (serverStatus) setServerRows((rows) => rows.map((l) => (l.id === id ? { ...l, assignedTo } : l)));
  };

  const assignedUsers = serverStatus ? serverAssignees : [...new Set(leads.map((l) => l.assignedTo))];

  // Options for a lead's assign dropdown. Always include the lead's CURRENT
  // assignee even if they're not in the employee list (e.g. names carried over
  // from the old system) — otherwise the dropdown shows blank and looks broken.
  const assignOptions = (current?: string) =>
    current && current !== 'Unassigned' && !employees.includes(current)
      ? [current, ...employees]
      : employees;

  // What to show when there are no rows (server mode may still be fetching).
  const emptyMessage = serverStatus && serverError
    ? "Couldn't load leads — check the connection and reload."
    : serverStatus && (serverLoading || !serverLoaded)
      ? 'Loading leads…'
      : null;

  const handleSort = (key: keyof Lead) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = serverStatus ? serverRows : leads
    .filter((l) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        l.name.toLowerCase().includes(q) ||
        l.mobileNumber.includes(q) ||
        l.district.toLowerCase().includes(q) ||
        l.service.toLowerCase().includes(q);
      const matchPayment =
      paymentFilter === 'all' || l.paymentStatus === paymentFilter;

      // "Tourist Visa" covers every country's visa ("Dubai Tourist Visa", …),
      // optionally narrowed to one country.
      const matchService =
      serviceFilter === 'all' ||
      (serviceFilter === 'Tourist Visa'
        ? isTouristVisa(l.service) &&
          (visaCountryFilter === 'all' || visaCountryOf(l) === visaCountryFilter)
        : l.service === serviceFilter);

      const matchAssigned =
      assignedFilter === 'all' || l.assignedTo === assignedFilter;

      return (
      matchSearch &&
      matchPayment &&
      matchService &&
      matchAssigned
      );
    })
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const DATE_KEYS: (keyof Lead)[] = ['date', 'createdAt', 'followUpDate'];
      if (DATE_KEYS.includes(sortKey)) {
        const da = new Date(String(av || '1970-01-01')).getTime();
        const db = new Date(String(bv || '1970-01-01')).getTime();
        return sortDir === 'asc' ? da - db : db - da;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });

  // In server mode `filtered` is already just the current page.
  const filteredTotal = serverStatus ? serverTotal : filtered.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const pageItems = serverStatus ? serverRows : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 when the user actively changes a filter — but NOT on the
  // initial mount (otherwise we'd trample the page restored from the URL).
  const firstFilterRender = useRef(true);
  useEffect(() => {
    if (firstFilterRender.current) { firstFilterRender.current = false; return; }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, paymentFilter, serviceFilter, visaCountryFilter, assignedFilter]);
  // (In server mode, wait for the first page so a ?page= restored from the URL
  // isn't clamped to 1 before the total is known.)
  useEffect(() => {
    if (serverStatus && !serverLoaded) return;
    setPage((p) => Math.min(p, Math.max(1, totalPages)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages, serverLoaded]);


  // Download the currently filtered leads as a CSV (opens in Excel/Sheets).
  // In server mode, fetch every match (not just the visible page) first.
  const exportCsv = async () => {
    let rows = filtered;
    if (serverQuery) {
      setExporting(true);
      try {
        rows = (await api.listLeadsPage({ ...serverQuery, all: true })).data;
      } catch {
        alert('Export failed — please try again.');
        return;
      } finally {
        setExporting(false);
      }
    }
    const headers = ['Date', 'Name', 'Mobile', 'Email', 'District', 'Service', 'Amount', 'Payment', 'Status', 'Assigned To'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [headers.join(',')];
    for (const l of rows) {
      lines.push([
        l.date, l.name, l.mobileNumber, l.email, l.district, l.service,
        l.amount, l.paymentStatus, l.status, l.assignedTo,
      ].map(esc).join(','));
    }
    // BOM so Excel reads UTF-8 correctly.
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Sort-arrow icons removed from the header — clicking the th still sorts,
  // but the columns no longer carry a chevron indicator.
  const Th = ({ col, label, className = '' }: { col: keyof Lead; label: string; className?: string }) => (
    <th
      onClick={() => handleSort(col)}
      className={`px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer select-none hover:text-gray-900 transition-colors whitespace-nowrap ${className}`}
    >
      {label}
    </th>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-gray-50">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, phone, district, service..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-all"
          />
        </div>
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">

    {/* SERVICE FILTER */}
    <select
    value={serviceFilter}
    onChange={(e) => { setServiceFilter(e.target.value); setVisaCountryFilter('all'); }}
    className="w-full sm:w-auto min-w-0 px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
    <option value="all">All Services</option>
    {SERVICES.map((s) => (
      <option key={s} value={s}>{s}</option>
    ))}
    </select>

    {/* VISA COUNTRY FILTER — only for Tourist Visa */}
    {serviceFilter === 'Tourist Visa' && (
      <select
      value={visaCountryFilter}
      onChange={(e) => setVisaCountryFilter(e.target.value)}
      className="w-full sm:w-auto min-w-0 px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
      <option value="all">All Countries</option>
      {VISA_COUNTRIES.map((c) => (
        <option key={c} value={c}>{c} Tourist Visa</option>
      ))}
      </select>
    )}

    {/* ASSIGNED TO FILTER */}
    <select
    value={assignedFilter}
    onChange={(e) => setAssignedFilter(e.target.value)}
    className="w-full sm:w-auto min-w-0 px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
    <option value="all">All Staff</option>

    {assignedUsers.map((user) => (
      <option key={user} value={user}>
        {user}
      </option>
    ))}
    </select>

    {/* PAYMENT FILTER */}
    <div className="w-full sm:w-auto min-w-0 flex items-center gap-1.5 px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-600">
    <Filter className="w-4 h-4 text-gray-400" />

    <select
      value={paymentFilter}
      onChange={(e) => setPaymentFilter(e.target.value)}
      className="bg-transparent focus:outline-none text-sm cursor-pointer"
     >
      <option value="all">All Payments</option>
      <option value="paid">Paid</option>
      <option value="unpaid">Unpaid</option>
    </select>
   </div>

    {/* EXPORT — downloads the currently filtered leads as CSV */}
    <button
      onClick={exportCsv}
      disabled={exporting}
      title="Export these leads to CSV"
      className="w-full sm:w-auto justify-center flex items-center gap-1.5 px-3 py-2.5 border border-blue-600 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
    >
      <Download className="w-4 h-4 text-white" />
      {exporting ? 'Exporting…' : 'Export'}
    </button>

</div>
      </div>

      {/* Bulk action bar — shown when rows are selected. Admin + Ganesh. */}
      {mayDelete && selected.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-100">
          <span className="text-sm font-semibold text-blue-700">{selected.size} lead{selected.size > 1 ? 's' : ''} selected</span>
          <button
            onClick={deleteSelected}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Selected
          </button>
        </div>
      )}

      {/* Table count */}
      <div className="px-4 py-2.5 bg-gray-50/50 border-b border-gray-50">
        <p className="text-xs text-gray-500 font-medium">
          {serverStatus
            ? `${serverTotal} lead${serverTotal !== 1 ? 's' : ''}${serverLoading ? ' · loading…' : ''}`
            : `Showing ${filtered.length} of ${leads.length} leads`}
        </p>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50/50">
            <tr>
              {mayDelete && (
                <th className="pl-4 pr-2 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every(l => selected.has(l.id))}
                    ref={el => { if (el) el.indeterminate = filtered.some(l => selected.has(l.id)) && !filtered.every(l => selected.has(l.id)); }}
                    onChange={() => toggleSelectAll(filtered)}
                    className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                  />
                </th>
              )}
              <Th col="slNo" label="#" className="w-10 hidden xl:table-cell" />
              <Th col="date" label="Date" className="hidden lg:table-cell" />
              <Th col="name" label="Name" />
              <Th col="mobileNumber" label="Mobile" />
              <Th col="district" label="District" className="hidden xl:table-cell" />
              <Th col="service" label="Service" />
              <Th col="amount" label="Amount" className="hidden lg:table-cell" />
              <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Payment</th>
              <th className="px-2 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Assigned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={mayDelete ? 10 : 9} className="px-4 py-12 text-center text-gray-400 text-sm">
                  {emptyMessage ?? 'No leads found matching your search.'}
                </td>
              </tr>
            ) : (
              pageItems.map((lead, index) => (
               <tr
               key={lead.id}
               onClick={() => {
                 const qs = searchParams.toString();
                 const from = qs ? `${pathname}?${qs}` : pathname;
                 router.push(`/leads/view?id=${lead.id}&from=${encodeURIComponent(from)}`);
               }}
               className={`hover:bg-blue-50/30 transition-colors group cursor-pointer ${selected.has(lead.id) ? 'bg-blue-50/50' : ''}`}
               >
                  {mayDelete && (
                    <td className="pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-2 py-2 text-xs text-gray-800 font-semibold hidden xl:table-cell">{(page - 1) * PAGE_SIZE + index + 1}</td>
                  <td className="px-2 py-2 text-xs text-gray-800 font-semibold whitespace-nowrap hidden lg:table-cell">{formatDate(lead.date)}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-600 text-[10px] font-bold">{lead.name[0]}</span>
                      </div>
                      <span className="text-xs font-bold text-gray-900 truncate">{lead.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-xs text-gray-900 font-semibold whitespace-nowrap">{lead.mobileNumber}</td>
                  <td className="px-2 py-2 text-xs text-gray-800 font-semibold whitespace-nowrap hidden xl:table-cell">{lead.district}</td>
                  <td className="px-2 py-2 max-w-[10rem]">
                    <ServiceBadge service={lead.service} />
                  </td>
                  <td className="px-2 py-2 text-xs font-semibold text-gray-900 whitespace-nowrap hidden lg:table-cell">
                    ₹{lead.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="px-2 py-2">
                    <PaymentBadge status={lead.paymentStatus} refundStatus={(lead as any).refundStatus} />
                  </td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    {isAdmin ? (
                      <select
                        value={lead.assignedTo || 'Unassigned'}
                        onChange={(e) => assignLead(lead.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 cursor-pointer max-w-[8rem]"
                      >
                        <option value="Unassigned">Select assigned user</option>
                        {assignOptions(lead.assignedTo).map((emp) => (
                          <option key={emp} value={emp}>{emp}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs font-semibold text-gray-900 truncate inline-block max-w-[8rem]">
                        {lead.assignedTo && lead.assignedTo !== 'Unassigned' ? lead.assignedTo : 'Unassigned'}
                      </span>
                    )}
                  </td>
                  
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden divide-y divide-gray-50">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400 text-sm">{emptyMessage ?? 'No leads found.'}</div>
        ) : (
          pageItems.map((lead) => (
            <div
              key={lead.id}
              onClick={() => {
                const qs = searchParams.toString();
                const from = qs ? `${pathname}?${qs}` : pathname;
                router.push(`/leads/view?id=${lead.id}&from=${encodeURIComponent(from)}`);
              }}
              className="block px-4 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 font-bold">{lead.name[0]}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">{lead.name}</p>
                    <p className="text-sm font-semibold text-gray-800">{lead.mobileNumber}</p>
                  </div>
                </div>
                {/* Right cluster: assign. stopPropagation so picking an
                    assignee doesn't also trigger the card's navigation.
                    Payment status moved down beside the amount. */}
                <div
                  className="flex flex-col items-end gap-1.5 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isAdmin ? (
                    <select
                      value={lead.assignedTo || 'Unassigned'}
                      onChange={(e) => assignLead(lead.id, e.target.value)}
                      className="text-[11px] font-medium border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 max-w-[8rem] truncate focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    >
                      <option value="Unassigned">+ Assign</option>
                      {assignOptions(lead.assignedTo).map((emp) => (
                        <option key={emp} value={emp}>{emp}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[11px] font-medium text-gray-600 max-w-[8rem] truncate">
                      {lead.assignedTo && lead.assignedTo !== 'Unassigned' ? lead.assignedTo : 'Unassigned'}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs font-bold text-gray-700 mt-3">{formatDate(lead.date)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-800 min-w-0 max-w-full">
                <ServiceBadge service={lead.service} />
                <span className="text-gray-300">·</span>
                <span className="truncate max-w-[45vw]">{lead.district}</span>
                <span className="text-gray-300">·</span>
                <span className="font-bold text-gray-900 whitespace-nowrap">₹{lead.amount.toLocaleString('en-IN')}</span>
                <PaymentBadge status={lead.paymentStatus} refundStatus={(lead as any).refundStatus} />
              </div>
            </div>
          ))
        )}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={filteredTotal}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDeleteOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10 p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-50 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">Delete {selected.size} lead{selected.size > 1 ? 's' : ''}?</h3>
            <p className="text-sm text-gray-500 mb-6">This action cannot be undone.</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setConfirmDeleteOpen(false)}
                className="px-5 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteSelected}
                className="px-5 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success modal — shown after leads are deleted */}
      {deleteSuccess !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteSuccess(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm z-10 p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">
              {deleteSuccess} lead{deleteSuccess > 1 ? 's' : ''} deleted successfully
            </h3>
            <p className="text-sm text-gray-500 mb-6">The list has been updated.</p>
            <button
              onClick={() => setDeleteSuccess(null)}
              className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
