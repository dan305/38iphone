/**
 * PageShell — Wrapper component shared by all pages.
 * Provides consistent heading, optional action button, and content area.
 */
'use client';

import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}

export default function PageShell({ title, subtitle, icon: Icon, action, children }: Props) {
  return (
    <div className="space-y-6 pb-10 text-slate-100">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/5">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-slate-300" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">{title}</h1>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {/* Page Content */}
      {children}
    </div>
  );
}
