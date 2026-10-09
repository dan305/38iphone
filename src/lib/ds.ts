/**
 * Design System — 38.iPhone ERP
 * Shared Tailwind class strings for consistent styling across all pages.
 * Import what you need from here instead of writing ad-hoc classes.
 */

// ── PAGE WRAPPER ─────────────────────────────────────────────────────────────
export const page = 'space-y-6 pb-10 max-w-[1400px] mx-auto';

// ── PAGE HEADER ──────────────────────────────────────────────────────────────
export const pageHeader = 'flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4';
export const pageTitle = 'text-2xl font-bold text-white tracking-tight';
export const pageSubtitle = 'text-sm text-slate-400 mt-0.5';

// ── CARDS ─────────────────────────────────────────────────────────────────────
export const card = 'bg-[#121216] border border-white/5 rounded-2xl shadow-md shadow-black/20';
export const cardPadded = `${card} p-5`;
export const cardHighlight = 'bg-[#121216] border border-purple-500/20 rounded-2xl shadow-md shadow-purple-900/10 p-5';

// ── KPI CARDS ─────────────────────────────────────────────────────────────────
export const kpiLabel = 'text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1';
export const kpiValue = 'text-3xl font-bold text-white font-mono';
export const kpiNote = 'text-xs text-slate-500 mt-2';

// ── SECTION LABELS ────────────────────────────────────────────────────────────
export const sectionLabel = 'text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3';

// ── TABLES ────────────────────────────────────────────────────────────────────
export const tableWrapper = `${card} overflow-hidden`;
export const tableEl = 'w-full text-sm text-left';
export const thead = 'border-b border-white/5 text-[10px] text-slate-500 uppercase tracking-widest';
export const th = 'px-5 py-3.5 font-semibold';
export const tbody = 'divide-y divide-white/[0.04]';
export const tr = 'hover:bg-white/[0.03] transition-colors';
export const td = 'px-5 py-4';

// ── INPUTS ────────────────────────────────────────────────────────────────────
export const input = 'w-full bg-[#0b0b0e] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all';
export const select = 'w-full bg-[#0b0b0e] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all appearance-none';
export const label = 'block text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5';
export const textarea = `${input} resize-none`;

// ── BUTTONS ───────────────────────────────────────────────────────────────────
export const btnPrimary = 'flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-950 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors shadow-sm';
export const btnSecondary = 'flex items-center gap-2 bg-white/5 hover:bg-white/10 text-slate-300 font-medium px-4 py-2.5 rounded-xl text-sm transition-colors border border-white/10';
export const btnDanger = 'flex items-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-medium px-4 py-2.5 rounded-xl text-sm transition-colors border border-rose-500/20';
export const btnGhost = 'p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors';

// ── BADGES ────────────────────────────────────────────────────────────────────
export const badgeGreen = 'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
export const badgeRed = 'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20';
export const badgeYellow = 'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20';
export const badgeBlue = 'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20';
export const badgeGray = 'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/5 text-slate-400 border border-white/10';

// ── SEARCH BAR ────────────────────────────────────────────────────────────────
export const searchWrapper = 'relative';
export const searchInput = `${input} pl-9`;

// ── MODALS ────────────────────────────────────────────────────────────────────
export const modalOverlay = 'fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50';
export const modalBox = `${card} w-full max-w-lg overflow-hidden`;
export const modalHeader = 'flex items-center justify-between px-6 py-4 border-b border-white/5';
export const modalBody = 'px-6 py-5 space-y-4';
export const modalFooter = 'flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5 bg-black/20';
