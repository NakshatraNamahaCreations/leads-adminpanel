import { LeadStatus } from './types';

// Canonical 11 backend services — mirrored across the website's home form
// (Solution.jsx), Contact Us, and the blog-detail contact form.
export const SERVICES = [
  'Passport',
  'PAN Card',
  'Tourist Visa',
  'Senior Citizen Card',
  'Rental Agreement',
  'Lease Agreement',
  'MSME Registration',
  'Insurance',
  'Police Clearance Certificate (PCC)',
  'Police Verification Certificate (PVC)',
  'Affidavits / Annexure',
];

// The website's 16 visa forms save the country inside the service name, e.g.
// "Dubai Tourist Visa". Older/imported leads say just "Tourist Visa" and keep
// the country in `applyingFor`. Used for the Tourist Visa → country filter.
export const VISA_COUNTRIES = [
  'Australia', 'Azerbaijan', 'Bahrain', 'Dubai', 'Egypt', 'Hong Kong',
  'Indonesia', 'Malaysia', 'Morocco', 'Oman', 'Qatar', 'Russia',
  'Singapore', 'UK', 'Uzbekistan', 'Vietnam',
];

const VISA_COUNTRY_ALIASES: Record<string, string> = {
  'united arab emirates': 'Dubai',
  'united arab emirated': 'Dubai',
  uae: 'Dubai',
  'united kingdom': 'UK',
};

export const isTouristVisa = (service?: string) => /tourist visa$/i.test(String(service || '').trim());

// Country of a tourist-visa lead ('' if unknown or not a visa lead).
export function visaCountryOf(lead: { service?: string; applyingFor?: string }): string {
  const service = String(lead.service || '').trim();
  if (!isTouristVisa(service)) return '';
  const raw = service.replace(/\s*tourist visa$/i, '').trim() || String(lead.applyingFor || '').trim();
  if (!raw) return '';
  const alias = VISA_COUNTRY_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  return VISA_COUNTRIES.find((c) => c.toLowerCase() === raw.toLowerCase()) || raw;
}

// Indian states + UTs — used in Team Settings to scope which states a team
// member handles (for state-based auto-assignment of new leads).
export const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

export const DISTRICTS = [
  'Bangalore Urban',
  'Bangalore Rural',
  'Mysuru',
  'Mangaluru',
  'Hubli-Dharwad',
  'Belagavi',
  'Kalaburagi',
  'Shivamogga',
  'Tumakuru',
  'Davangere',
  'Ballari',
  'Vijayapura',
  'Hassan',
  'Mandya',
  'Udupi',
  'Chikkamagaluru',
  'Kodagu',
  'Raichur',
  'Koppal',
  'Gadag',
  'Other',
];

export const LEAD_SOURCES = [
  'Website',
  'WhatsApp',
  'Google Ads',
  'Facebook Ads',
  'Instagram',
  'Referral',
  'Walk-in',
  'Phone Call',
  'Other',
];

export const STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; color: string; bg: string; border: string; dot: string }
> = {
  new: {
    label: 'New Lead',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
  overdue: {
    label: 'Overdue',
    color: 'text-gray-600',
    bg: 'bg-gray-100',
    border: 'border-gray-200',
    dot: 'bg-gray-400',
  },
  today: {
    label: "Today's Follow-up",
    color: 'text-teal-700',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    dot: 'bg-teal-500',
  },
  followup: {
    label: 'Follow-up',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  inprocess: {
    label: 'In Process',
    color: 'text-cyan-700',
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    dot: 'bg-cyan-500',
  },
  converted: {
    label: 'Converted',
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    dot: 'bg-green-500',
  },
  dead: {
    label: 'Dead',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    dot: 'bg-red-500',
  },
};

export const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
  { href: '/leads/add', label: 'Add Lead', icon: 'PlusCircle' },
  { href: '/leads/new', label: 'New Leads', icon: 'UserPlus' },
  { href: '/leads/overdue', label: 'Overdue', icon: 'AlertCircle' },
  { href: '/leads/today', label: "Today's Follow-up", icon: 'CalendarCheck' },
  { href: '/leads/followup', label: 'Follow-up', icon: 'UserCheck' },
  { href: '/leads/inprocess', label: 'In Process', icon: 'Clock' },
  { href: '/leads/converted', label: 'Converted', icon: 'CheckCircle' },
  { href: '/leads/dead', label: 'Dead', icon: 'XCircle' },
  { href: '/settings', label: 'Settings', icon: 'Settings' },
  { href: '/blogs', label: 'Blogs', icon: 'BookOpen' },
];
