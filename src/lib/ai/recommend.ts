import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Recommendation } from './types';

const norm = (s?: string | null) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Extrae el número de generación: "iPhone 13 Pro" -> 13 */
export const generation = (model?: string | null): number | null => {
  const m = /iphone\s*(\d{1,2})/i.exec(model || '');
  return m ? Number(m[1]) : null;
};
const tier = (model?: string | null) => {
  const n = norm(model);
  if (n.includes('pro max')) return 3;
  if (n.includes('pro')) return 2;
  if (n.includes('plus')) return 1;
  return 0;
};

/**
 * Motor de recomendación DETERMINISTA (precios y stock salen de la base,
 * la IA nunca los inventa).
 *  - Accesorios: compatibles con el modelo que quiere o que ya tiene, con stock.
 *  - Upgrade: del stock disponible, el modelo de generación superior más cercano
 *    al que el cliente tiene hoy (o un escalón arriba del que pidió), dentro de presupuesto si lo dijo.
 */
export async function buildRecommendations(opts: {
  interestedModel?: string | null;
  currentModel?: string | null;      // lo que entrega / tiene
  budgetUsd?: number | null;
}): Promise<Recommendation[]> {
  const out: Recommendation[] = [];
  const target = opts.interestedModel || opts.currentModel;

  // ── Accesorios
  if (target) {
    const { data: acc } = await supabaseAdmin
      .from('accessories').select('name, category, compatible_models, price_usd, stock')
      .eq('active', true).gt('stock', 0);
    const t = norm(target);
    const compatible = (acc || []).filter(
      (a) => !a.compatible_models?.length || a.compatible_models.some((m: string) => t.includes(norm(m)) || norm(m).includes(t))
    );
    const byCat: Record<string, typeof compatible[number]> = {};
    for (const a of compatible.sort((x, y) => Number(x.price_usd) - Number(y.price_usd))) {
      if (!byCat[a.category]) byCat[a.category] = a;       // el más económico por categoría
    }
    const reasons: Record<string, string> = {
      vidrio: 'Protege la pantalla desde el día uno',
      funda: 'Cuida el equipo de golpes',
      cargador: 'Carga rápida original/certificada',
      cable: 'Cable reforzado compatible',
      auricular: 'Complemento ideal',
    };
    for (const cat of ['vidrio', 'funda', 'cargador']) {
      const a = byCat[cat];
      if (a) out.push({ type: 'accessory', name: a.name, price_usd: Number(a.price_usd), reason: reasons[cat] });
    }
  }

  // ── Upgrade (desde el stock real)
  const baseModel = opts.currentModel || opts.interestedModel;
  const baseGen = generation(baseModel);
  if (baseGen) {
    const { data: stock } = await supabaseAdmin
      .from('devices').select('suggested_price_usd, products(model, capacity)')
      .ilike('status', 'disponible');
    const candidates = (stock || [])
      .map((d: any) => ({ model: d.products?.model as string, cap: d.products?.capacity as string, price: Number(d.suggested_price_usd || 0) }))
      .filter((d) => d.model && d.price > 0 && (generation(d.model) || 0) > baseGen - (opts.currentModel ? 0 : 1))
      .filter((d) => !opts.budgetUsd || d.price <= opts.budgetUsd * 1.15)
      .filter((d) => norm(d.model) !== norm(opts.interestedModel) || !!opts.currentModel);
    candidates.sort((a, b) => (generation(a.model)! - generation(b.model)!) || (tier(a.model) - tier(b.model)) || a.price - b.price);
    const best = candidates[0];
    if (best) {
      out.push({
        type: 'upgrade',
        name: `${best.model} ${best.cap || ''}`.trim(),
        price_usd: best.price,
        reason: opts.currentModel ? `Upgrade natural desde tu ${opts.currentModel}` : 'Un escalón arriba por poco más',
      });
    }
  }
  return out;
}
