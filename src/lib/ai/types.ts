export type Channel = 'whatsapp' | 'instagram';
export type LeadTemp = 'frio' | 'tibio' | 'caliente';
export type Mode = 'autonomous' | 'copilot' | 'off';

export interface Recommendation {
  type: 'accessory' | 'upgrade';
  name: string;
  price_usd: number;
  reason: string;
}

export interface Analysis {
  intent: 'comprar' | 'consulta_precio' | 'plan_canje' | 'soporte' | 'saludo' | 'otro';
  lead_score: number;            // 0-100
  signals: string[];             // por qué ese score
  interested_model: string | null;
  interested_capacity: string | null;
  budget_usd: number | null;
  has_trade_in: boolean;
  trade_in_model: string | null;
  trade_in_battery: number | null;
  needs_human: boolean;          // la IA no debería responder sola
  reply: string;                 // respuesta lista para enviar
  reasoning: string;
}

export interface IncomingMessage {
  channel: Channel;
  externalContactId: string;     // wa_id o IGSID
  contactName?: string | null;
  handle?: string | null;
  text: string;
  externalMessageId: string;
  timestamp?: Date;
  skipAI?: boolean;              // adjuntos/audios: se guardan pero no se analizan
}
