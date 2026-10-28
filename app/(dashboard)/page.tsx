'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  UserPlus,
  AlertCircle,
  CalendarCheck,
  UserCheck,
  Clock,
  CheckCircle,
  ArrowRight,
  FileText,
  Calendar,
  ChevronDown,
  Check,
} from 'lucide-react';

import { useAuthUser } from '@/lib/useAuthUser';
import * as api from '@/lib/api';

import BarChart from '@/components/dashboard/BarChart';
import DonutChart from '@/components/dashboard/DonutChart';

import { useAddLead } from '@/context/AddLeadContext';

const PIPELINE_TABS = [
  {
    key: 'new',
    label: 'Active New Leads',
    color: 'from-blue-500 to-blue-600',
    href: '/leads/new',
    icon: UserPlus,
  },
  {
    key: 'overdue',
    label: 'Current Overdue',
    color: 'from-gray-400 to-gray-500',
    href: '/leads/overdue',
    icon: AlertCircle,
  },
  {
    key: 'today',
    label: "Today's Follow-up",
    color: 'from-teal-500 to-teal-600',
    href: '/leads/today',
    icon: CalendarCheck,
  },
  {
    key: 'followup',
    label: 'Pending Follow-up',
    color: 'from-amber-400 to-amber-500',
    href: '/leads/followup',
    icon: UserCheck,
  },
  {
    key: 'inprocess',
    label: 'In Process',
    color: 'from-violet-500 to-violet-600',
    href: '/leads/inprocess',
    icon: Clock,
  },
  {
    key: 'converted',
    label: 'Total Converted',
    color: 'from-emerald-500 to-emerald-600',
    href: '/leads/converted',
    icon: CheckCircle,
  },
];

export default function DashboardPage() {
  const { leads, openModal, stats: serverStats } = useAddLead();
  const user = useAuthUser();

  // Counts come from the server (authoritative, exact). Fall back to counting
  // the in-memory list only until the first stats response arrives.
  const stats = serverStats ?? {
    new:       leads.filter((l) => l.status === 'new').length,
    overdue:   leads.filter((l) => l.status === 'overdue').length,
    today:     leads.filter((l) => l.status === 'today').length,
    followup:  leads.filter((l) => l.status === 'followup').length,
    inprocess: leads.filter((l) => l.status === 'inprocess').length,
    converted: leads.filter((l) => l.status === 'converted').length,
    dead:      leads.filter((l) => l.status === 'dead').length,
    total:     leads.length,
  };

  const total = stats.total;

  const donutData = [
    { label: 'Active New Leads', value: stats.new, color: '#3b82f6' },
    { label: 'Current Overdue', value: stats.overdue, color: '#9ca3af' },
    { label: "Today's Follow-up", value: stats.today, color: '#14b8a6' },
    { label: 'Pending Follow-up', value: stats.followup, color: '#f59e0b' },
    { label: 'In Process', value: stats.inprocess, color: '#8b5cf6' },
    { label: 'Total Converted', value: stats.converted, color: '#10b981' },
    { label: 'Dead Leads', value: stats.dead, color: '#ef4444' },
  ];

  // Leads Overview chart range filter.
  const thisYear = new Date().getFullYear();
  const [range, setRange] = useState<'1m' | '3m' | '6m' | '12m' | 'year' | 'all' | 'custom'>('year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [rangeOpen, setRangeOpen] = useState(false);
  const rangeRef = useRef<HTMLDivElement>(null);
  const RANGE_OPTS: { key: typeof range; label: string }[] = [
    { key: '1m', label: 'Last 30 Days' },
    { key: '3m', label: 'Last 3 Months' },
    { key: '6m', label: 'Last 6 Months' },
    { key: '12m', label: 'Last 12 Months' },
    { key: 'year', label: `This Year (${thisYear})` },
    { key: 'all', label: 'All Time' },
    { key: 'custom', label: 'Custom Range' },
  ];
  const rangeLabel = RANGE_OPTS.find((o) => o.key === range)?.label || '';

  // Category Distribution date filter (independent of the chart filter above).
  const [catFrom, setCatFrom] = useState('');
  const [catTo, setCatTo] = useState('');

  // Chart data is aggregated on the server (the in-memory list only holds the
  // open leads). Employees see only their own leads.
  const chartScope = user.role && user.role !== 'admin' ? user.name : undefined;

  // Conversion rate per service, optionally limited to a custom date range.
  const [categoryData, setCategoryData] = useState<{ name: string; count: number; converted: number }[]>([]);
  useEffect(() => {
    if (!user.role) return;
    let active = true;
    api.getServiceStats({ from: catFrom || undefined, to: catTo || undefined, assignedTo: chartScope })
      .then((rows) => { if (active) setCategoryData(rows); })
      .catch(() => {});
    return () => { active = false; };
  }, [user.role, chartScope, catFrom, catTo]);

  // Leads created per day ("YYYY-MM-DD" → count), for the overview bars.
  const [dailyCounts, setDailyCounts] = useState<{ d: string; n: number }[]>([]);
  useEffect(() => {
    if (!user.role) return;
    let active = true;
    api.getDailyCounts(chartScope)
      .then((rows) => { if (active) setDailyCounts(rows); })
      .catch(() => {});
    return () => { active = false; };
  }, [user.role, chartScope]);
  const { byDay, byMonth } = useMemo(() => {
    const day = new Map<string, number>();
    const month = new Map<string, number>();
    for (const { d, n } of dailyCounts) {
      day.set(d, n);
      month.set(d.slice(0, 7), (month.get(d.slice(0, 7)) || 0) + n);
    }
    return { byDay: day, byMonth: month };
  }, [dailyCounts]);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const countDay = (d: Date) => byDay.get(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`) || 0;
  const countMonth = (y: number, m: number) => byMonth.get(`${y}-${pad2(m + 1)}`) || 0;

  // Close the range dropdown on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rangeRef.current && !rangeRef.current.contains(e.target as Node)) setRangeOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const monthlyData = useMemo(() => {
    const now = new Date();
    if (range === '1m') {
      // Last 30 days, one bar per day.
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      return Array.from({ length: 30 }, (_, i) => {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        return {
          label: String(d.getDate()),
          tip: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
          value: countDay(d),
        };
      });
    }

    if (range === 'custom') {
      // Between the two chosen dates. Daily bars for short spans, else monthly.
      if (!customFrom || !customTo) return [];
      const from = new Date(customFrom + 'T00:00:00');
      const to = new Date(customTo + 'T23:59:59');
      if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return [];
      const dayMs = 86400000;
      const spanDays = Math.round((to.getTime() - from.getTime()) / dayMs) + 1;
      if (spanDays <= 62) {
        return Array.from({ length: spanDays }, (_, i) => {
          const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
          return {
            label: String(d.getDate()),
            tip: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
            value: countDay(d),
          };
        });
      }
      // Monthly buckets across the custom span.
      const buckets: { y: number; m: number }[] = [];
      const cur = new Date(from.getFullYear(), from.getMonth(), 1);
      const end = new Date(to.getFullYear(), to.getMonth(), 1);
      while (cur <= end) {
        buckets.push({ y: cur.getFullYear(), m: cur.getMonth() });
        cur.setMonth(cur.getMonth() + 1);
      }
      return buckets.map((b) => ({
        label: `${MONTHS[b.m]} '${String(b.y).slice(2)}`,
        tip: `${MONTHS[b.m]} ${b.y}`,
        value: countMonth(b.y, b.m),
      }));
    }

    if (range === 'year') {
      // This calendar year, Jan–Dec.
      return MONTHS.map((label, m) => ({
        label,
        tip: `${label} ${now.getFullYear()}`,
        value: countMonth(now.getFullYear(), m),
      }));
    }

    // Monthly buckets. For "all", span from the earliest lead month to now
    // (capped at 36 months) so historical/migrated data actually shows.
    let monthsBack;
    if (range === '3m') monthsBack = 3;
    else if (range === '6m') monthsBack = 6;
    else if (range === '12m') monthsBack = 12;
    else {
      const earliest = dailyCounts.length ? new Date(dailyCounts[0].d + 'T00:00:00') : now;
      monthsBack =
        (now.getFullYear() - earliest.getFullYear()) * 12 +
        (now.getMonth() - earliest.getMonth()) + 1;
      monthsBack = Math.min(Math.max(monthsBack, 1), 36);
    }

    return Array.from({ length: monthsBack }, (_, idx) => {
      const i = monthsBack - 1 - idx;
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear(), m = d.getMonth();
      return {
        // Show the year in the axis label only in January / multi-year spans,
        // and always in the tooltip.
        label: monthsBack > 12 ? `${MONTHS[m]} '${String(y).slice(2)}` : MONTHS[m],
        tip: `${MONTHS[m]} ${y}`,
        value: countMonth(y, m),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDay, byMonth, dailyCounts, range, customFrom, customTo]);

  const rangeSubtitle =
    range === 'custom' ? (customFrom && customTo ? `Lead activity — ${customFrom} to ${customTo}` : 'Pick a start and end date')
    : range === '1m' ? 'Daily lead activity — last 30 days'
    : range === '3m' ? 'Monthly lead activity — last 3 months'
    : range === '6m' ? 'Monthly lead activity — last 6 months'
    : range === '12m' ? 'Monthly lead activity — last 12 months'
    : range === 'year' ? `Monthly lead activity — ${thisYear}`
    : 'Monthly lead activity — all time';

  const [greeting, setGreeting] = useState('');
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
  }, []);

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting ? `${greeting}, ${user.name.split(' ')[0]}! 👋` : ''}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Here's what's happening with your leads today.
          </p>
        </div>
        <button
          onClick={openModal}
          className="hidden sm:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Add Lead
        </button>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {PIPELINE_TABS.map(({ key, label, color, href, icon: Icon }) => {
          const count = stats[key as keyof typeof stats] as number;

          return (
            <Link
              key={key}
              href={href}
              className={`bg-gradient-to-br ${color} rounded-2xl p-5 text-white hover:-translate-y-1 transition-all shadow-sm`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/80 text-xs font-semibold uppercase tracking-wide">
                  {label}
                </span>

                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                  <Icon className="w-4 h-4 text-white" />
                </div>
              </div>

              <p className="text-4xl font-bold">{count}</p>

              <div className="flex items-center gap-1 mt-2 text-white/70 text-xs font-medium">
                <span>View leads</span>

                <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* LEADS OVERVIEW — full width */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h2 className="font-bold text-gray-900 text-base">Leads Overview</h2>
            <p className="text-xs text-gray-400 mt-1">{rangeSubtitle}</p>
          </div>
          {/* Range filter — dropdown */}
          <div className="relative self-start" ref={rangeRef}>
            <button
              onClick={() => setRangeOpen((v) => !v)}
              className="flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-xl border border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 text-sm font-semibold text-gray-700 transition-colors shadow-sm"
            >
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>{rangeLabel}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${rangeOpen ? 'rotate-180' : ''}`} />
            </button>

            {rangeOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl border border-gray-100 shadow-xl z-30 overflow-hidden p-1">
                {RANGE_OPTS.map((o) => {
                  const active = range === o.key;
                  return (
                    <button
                      key={o.key}
                      onClick={() => { setRange(o.key); setRangeOpen(false); }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span>{o.label}</span>
                      {active && <Check className="w-4 h-4 text-blue-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Custom date inputs — only when "Custom Range" is selected */}
        {range === 'custom' && (
          <div className="flex flex-wrap items-end gap-3 mb-5">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        <BarChart data={monthlyData} />
      </div>

      {/* CATEGORY + LEAD DISTRIBUTION — same row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* CATEGORY DISTRIBUTION */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="font-bold text-gray-900">Category Distribution</h2>
              <p className="text-xs text-gray-400">
                {catFrom && catTo ? `Leads by service — ${catFrom} to ${catTo}` : 'Leads by service'}
              </p>
            </div>
          </div>

          {/* Custom date filter for category distribution */}
          <div className="flex flex-wrap items-end gap-2 mb-5">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">From</label>
              <input type="date" value={catFrom} max={catTo || undefined} onChange={(e) => setCatFrom(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">To</label>
              <input type="date" value={catTo} min={catFrom || undefined} onChange={(e) => setCatTo(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {(catFrom || catTo) && (
              <button onClick={() => { setCatFrom(''); setCatTo(''); }}
                className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-100">
                Clear
              </button>
            )}
          </div>

          <div className="space-y-5 max-h-[420px] overflow-y-auto pr-2 custom-scrollbar">
            {categoryData
              .sort((a, b) => b.count - a.count)
              .map((item) => {
                // Conversion rate within this service — i.e. of all the leads
                // for `item.name`, what fraction reached the `converted` status.
                const conversionPct = item.count > 0 ? (item.converted / item.count) * 100 : 0;
                const pctLabel = conversionPct.toFixed(1);

                return (
                  <div key={item.name} className="group cursor-pointer category-card">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-600" />
                        <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-bold text-gray-900">{item.converted}/{item.count}</span>
                        <span className="text-xs text-emerald-600 tabular-nums">{pctLabel}% converted</span>
                      </div>
                    </div>

                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500"
                        style={{ width: `${conversionPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* LEAD DISTRIBUTION */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="mb-5">
            <h2 className="font-bold text-gray-900">Lead Distribution</h2>
            <p className="text-xs text-gray-400 mt-1">Current lead pipeline distribution</p>
          </div>

          <DonutChart data={donutData} />

          <div className="mt-5 pt-4 border-t border-gray-50 flex items-center justify-between text-xs">
            <span className="text-gray-500">Conversion rate</span>
            <span className="font-bold text-emerald-600">
              {total > 0 ? ((stats.converted / total) * 100).toFixed(1) : '0.0'}%
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}