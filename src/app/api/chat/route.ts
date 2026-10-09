import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: Request) {
  try {
    const { message, history } = await req.json();
    
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        reply: "Che Dan, para que yo pueda ser tan inteligente como ChatGPT y hablar de cualquier cosa, necesito que pongas tu OPENAI_API_KEY en el archivo .env.local del proyecto. ¡Avisame cuando esté!" 
      });
    }

    // Recopilar contexto en tiempo real de la base de datos
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    // Obtener stock
    const { data: devices } = await supabase.from('devices').select('status, suggested_price_usd, products(model)').eq('status', 'Disponible');
    let stockSummary = 'No hay stock.';
    if (devices && devices.length > 0) {
      const counts: Record<string, number> = {};
      devices.forEach(d => {
        const m = (d.products as any)?.model || 'Desconocido';
        counts[m] = (counts[m] || 0) + 1;
      });
      stockSummary = Object.entries(counts).map(([m, qty]) => `${qty}x ${m}`).join(', ');
    }

    // Obtener ventas
    const { data: sales } = await supabase.from('sales').select('total_usd').gte('created_at', startOfMonth);
    const totalVentas = (sales || []).reduce((acc, s) => acc + Number(s.total_usd || 0), 0);

    const systemPrompt = `Sos 38.iPhone IA, el asistente virtual ultra avanzado del ERP de 38 iPhone. 
Tu dueño y jefe se llama Dan. 
Tenés que hablar 100% en tono argentino, usando palabras como "che", "dale", "mirá", "fijate", "joya", "bancame".
Sos muy servicial y podés hablar de cualquier cosa que te pregunte Dan (como ChatGPT), pero tu foco principal es su negocio de venta de iPhones.

INFORMACIÓN EN TIEMPO REAL DEL NEGOCIO:
- Stock disponible actual: ${stockSummary}
- Ventas totales este mes: $${totalVentas} USD.

REGLAS DE COMPORTAMIENTO:
1. Si Dan te pregunta cómo está, o cualquier cosa fuera del negocio, respondé amigablemente en tono argentino.
2. Si Dan te pide registrar una venta (ej: "che registrame una venta de un iphone 14 para luis"), vos NO podés guardarla directamente aún, pero tenés que seguirle el juego y decirle algo como: "¡Dale, de una! Ya te preparo la venta para Luis. Pasame a qué precio se lo cerraste y cómo te pagó así completo los datos".
3. Si te pregunta por stock, usá la INFORMACIÓN EN TIEMPO REAL para responderle.
4. Mantené respuestas concisas, conversacionales y muy naturales. Nada de formato robótico.`;

    // Formatear el historial para OpenAI
    const openAiMessages = [
      { role: 'system', content: systemPrompt },
      ...history.map((m: any) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      })),
      { role: 'user', content: message }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: openAiMessages,
        temperature: 0.7,
        max_tokens: 250
      })
    });

    const data = await response.json();
    if (data.error) {
      console.error('OpenAI Error:', data.error);
      return NextResponse.json({ reply: 'Uy che, me tiró un error el servidor de OpenAI. Revisá la consola o fijate si hay saldo en la API Key.' });
    }

    const reply = data.choices[0].message.content;

    return NextResponse.json({ reply });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ reply: 'Uy, che, me dio un error interno de conexión. Bancame un toque y probá de nuevo.' });
  }
}
