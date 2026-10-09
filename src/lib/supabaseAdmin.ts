import { createClient } from '@supabase/supabase-js';

/**
 * Cliente con SERVICE ROLE: ignora RLS. SOLO usar en rutas de servidor
 * (webhooks, /api/*). Nunca importarlo desde un componente 'use client'.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
