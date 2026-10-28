'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import { STATUS_CONFIG } from '@/lib/constants';
import { LeadStatus } from '@/lib/types';
import LeadTable from '@/components/leads/LeadTable';
import {
  UserPlus, AlertCircle, CalendarCheck, UserCheck,
  Clock, CheckCircle, XCircle,
} from 'lucide-react';
import { useAddLead } from '@/context/AddLeadContext';

const VALID: LeadStatus[] = ['new', 'overdue', 'today', 'followup', 'inprocess', 'converted', 'dead'];

const STATUS_META: Record<LeadStatus, {
  icon: React.ElementType;
  gradient: string;
  lightBg: string;
  textColor: string;
  description: string;
}> = {
  new:       { icon: UserPlus,      gradient: 'from-blue-500 to-blue-600',      lightBg: 'bg-blue-50',    textColor: 'text-blue-600',    description: 'Leads waiting to be contacted' },
  overdue:   { icon: AlertCircle,   gradient: 'from-gray-400 to-gray-500',      lightBg: 'bg-gray-100',   textColor: 'text-gray-500',    description: 'Past their follow-up date' },
  today:     { icon: CalendarCheck, gradient: 'from-teal-500 to-teal-600',      lightBg: 'bg-teal-50',    textColor: 'text-teal-600',    description: 'Scheduled for follow-up today' },
  followup:  { icon: UserCheck,     gradient: 'from-amber-400 to-amber-500',    lightBg: 'bg-amber-50',   textColor: 'text-amber-600',   description: 'Awaiting follow-up' },
  inprocess: { icon: Clock,         gradient: 'from-violet-500 to-violet-600',  lightBg: 'bg-violet-50',  textColor: 'text-violet-600',  description: 'Documents being processed' },
  converted: { icon: CheckCircle,   gradient: 'from-emerald-500 to-emerald-600',lightBg: 'bg-emerald-50', textColor: 'text-emerald-600', description: 'Successfully converted leads' },
  dead:      { icon: XCircle,       gradient: 'from-red-500 to-red-600',        lightBg: 'bg-red-50',     textColor: 'text-red-600',     description: 'Leads that did not convert' },
};

export default function LeadStatusPageClient({ params }: { params: Promise<{ status: string }> }) {
  const { status } = use(params);
  const { leads: allLeads, stats } = useAddLead();
  if (!VALID.includes(status as LeadStatus)) notFound();

  const s = status as LeadStatus;
  // Converted/dead hold ~99% of all leads, so those tabs page on the server;
  // the open tabs filter the in-memory list.
  const serverStatus = s === 'converted' || s === 'dead' ? s : undefined;
  const leads = serverStatus ? [] : allLeads.filter((lead) => lead.status === s);
  // Header count comes from the authoritative server stats.
  const count = stats ? stats[s] : leads.length;
  const cfg = STATUS_CONFIG[s];
  const meta = STATUS_META[s];
  const Icon = meta.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 bg-gradient-to-br ${meta.gradient} rounded-2xl flex items-center justify-center shadow-sm`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{cfg.label}</h1>
            <p className="text-sm text-gray-400">{meta.description}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${meta.lightBg} ${meta.textColor}`}>
          {count} lead{count !== 1 ? 's' : ''} in {cfg.label}
        </span>
      </div>

      {/* key: remount on tab switch so filters/page don't carry across tabs */}
      <LeadTable key={s} leads={leads} serverStatus={serverStatus} />
    </div>
  );
}
