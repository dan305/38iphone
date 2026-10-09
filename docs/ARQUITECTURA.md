# IA Comercial — Arquitectura y puesta en marcha

## 1. Flujo general

```
Cliente (IG / WhatsApp)
        │  mensaje
        ▼
Meta Webhooks ──POST──► /api/webhooks/whatsapp | /instagram
        │  (valida firma HMAC, responde 200 al instante, procesa con after())
        ▼
processIncoming()  (src/lib/ai/pipeline.ts)
  1. upsert conversations  (+ enlaza cliente del ERP por teléfono)
  2. insert messages        (idempotente por wamid/mid)
  3. analyzeConversation()  → intención, modelo, presupuesto, usado, score
  4. lead_events + update conversations (score, temperatura, venta estimada)
  5. buildRecommendations() → accesorios / upgrade desde stock REAL
  6. según modo:
       autonomous → responde solo (si no hay "needs_human" y hay ventana 24 hs)
       copilot    → guarda ai_suggestions(status=pending)
       human/off  → solo scoring
        ▼
Supabase Realtime ──► /conversaciones (tablero, KPIs, chat, sugerencia 1 clic)
        │ clic "Enviar"
        ▼
POST /api/conversations/[id]/send → Graph API → cliente
```

Principio clave: **la IA redacta e interpreta; los precios, el stock y las
cotizaciones salen siempre de tu base** (tablas `devices`, `trade_in_ranges`,
`accessories`). El prompt prohíbe inventar y el motor de recomendación es código
determinista.

## 2. Base de datos (supabase/migrations/001_ai_commercial.sql)

| Tabla | Para qué |
|---|---|
| `ai_settings` | Modo global (autónomo/copiloto/apagado), umbrales de score, tono |
| `conversations` | 1 por contacto/canal: score, temperatura, modelo de interés, usado, venta estimada, no leídos |
| `messages` | Historial entrante/saliente (`sender`: customer/ai/agent) |
| `ai_suggestions` | Respuestas sugeridas del copiloto + recomendaciones (jsonb) |
| `lead_events` | Historial del score (auditoría / gráficos futuros) |
| `accessories` | Catálogo para cross-selling, con modelos compatibles |
| `trade_in_ranges` | Rangos de cotización de usados + descuento por batería |
| `ai_faqs` | Respuestas frecuentes |

Incluye triggers (mantienen la bandeja al día), RLS (usuarios autenticados del ERP;
los webhooks usan service role), publicación Realtime y arreglos de inventario
(IMEI/serie únicos, estados normalizados).

## 3. Lead scoring

Score 0-100 = 60 % LLM + 40 % reglas (intención, modelo concreto, presupuesto,
usado, palabras de cierre como "reservo", "seña", "paso hoy", dirección, medio de pago;
resta por "solo miro", "caro"). Frío < 40 ≤ Tibio < 70 ≤ Caliente (editable en `ai_settings`).

## 4. Puesta en marcha

1. `npm install` (se agregaron `lucide-react` y `recharts`, que faltaban).
2. Supabase → SQL Editor → ejecutar `supabase/migrations/001_ai_commercial.sql`.
3. Copiar `.env.example` a `.env.local` y completar (sobre todo `SUPABASE_SERVICE_ROLE_KEY`, solo servidor).
4. Cargar en **IA Config**: accesorios, rangos de usados y FAQs.
5. Meta for Developers → tu app:
   - WhatsApp → Configuration → Callback URL `https://TU-DOMINIO/api/webhooks/whatsapp`, Verify token = `META_VERIFY_TOKEN`, suscribir `messages`.
   - Instagram → Webhooks → `https://TU-DOMINIO/api/webhooks/instagram`, suscribir `messages`.
6. Deploy (Vercel). Los webhooks necesitan URL pública HTTPS; para probar local usá un túnel (ngrok / cloudflared).
7. Empezar en **Copiloto**; pasar a **Autónomo** cuando confíes en las respuestas.

## 5. Límites reales de Meta (importante)

- Solo se puede responder texto libre dentro de **24 hs** desde el último mensaje del cliente. Pasado eso, WhatsApp exige plantillas aprobadas. El ERP lo avisa y bloquea el envío.
- WhatsApp: necesitás WhatsApp Business Platform (Cloud API) con número verificado. Instagram: cuenta profesional + permisos `instagram_manage_messages` (requiere App Review para producción).
- Audios/imágenes se guardan como `[tipo]` y no se analizan (siguiente paso: transcripción).

## 6. Próximos pasos sugeridos

- Plantillas de WhatsApp para reactivar leads fuera de ventana.
- Transcripción de audios (Whisper) y lectura de fotos del usado.
- Asignación de chats a vendedores y notificación sonora para leads calientes.
- Crear automáticamente `customers` / reserva de equipo en `devices` al cerrar la venta.

## 7. Instagram: dos caminos
- **Instagram Login (recomendado, sin Página de Facebook):** host `graph.instagram.com`, firma con `INSTAGRAM_APP_SECRET`.
- **Facebook Login (token de Página):** definí `INSTAGRAM_API_HOST=https://graph.facebook.com`, firma con `META_APP_SECRET`.
