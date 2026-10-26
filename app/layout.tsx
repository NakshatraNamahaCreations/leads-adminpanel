import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata: Metadata = {
  title: 'MMD CRM',
  description: 'Lead management dashboard for Make My Documents',
  manifest: '/manifest.json',
  applicationName: 'MMD CRM',
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
  // iPhone "Add to Home Screen": open full-screen with this name
  appleWebApp: { capable: true, title: 'MMD CRM', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  // No maximumScale: locking it to 1 triggers a Chrome device-mode re-layout
  // glitch (page only fits after a refresh) and blocks pinch-zoom.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased" suppressHydrationWarning>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
