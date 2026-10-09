import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface TradeInQuote {
  model: string;
  capacity: string | null;
  min_usd: number;
  max_usd: number;
  note: string;
}

const norm = (s?: string | null) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Rango de cotización del usado según tabla trade_in_ranges + ajuste por batería. */
export async function quoteTradeIn(model?: string | null, capacity?: string | null, battery?: number | null): Promise<TradeInQuote | null> {
  if (!model) return null;
  const { data } = await supabaseAdmin.from('trade_in_ranges').select('*');
  const rows = (data || []).filter((r: any) => norm(r.model) === norm(model));
  if (!rows.length) return null;
  const row = rows.find((r: any) => norm(r.capacity) === norm(capacity)) || rows[0];
  let min = Number(row.min_usd);
  let max = Number(row.max_usd);
  let note = 'Rango estimado, sujeto a revisión física del equipo.';
  if (battery != null && battery < row.min_battery) {
    const penalty = Number(row.battery_penalty_usd);
    min = Math.max(0, min - penalty);
    max = Math.max(0, max - penalty);
    note = `Incluye ajuste por batería (${battery}%). Sujeto a revisión física.`;
  }
  return { model: row.model, capacity: row.capacity, min_usd: min, max_usd: max, note };
}
