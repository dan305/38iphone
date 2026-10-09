'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Bot, Mic, Send, X, Loader2, CheckCircle2, Volume2, VolumeX } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  actionType?: 'link' | 'none';
  actionUrl?: string;
  actionText?: string;
}

export default function AiAssistant() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'bot', text: '¡Hola Dan! Soy tu asistente de IA avanzado 🤖. Estoy conectado a toda tu base de datos. Preguntame por ventas del día, precios, gastos, stock o decime adónde querés ir.' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'es-AR';
        recognition.interimResults = false;

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInputValue(transcript);
          handleSend(transcript);
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error', event.error);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const speakText = (text: string) => {
    if (!soundEnabled) return;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      // Detener cualquier habla anterior
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-AR';
      utterance.rate = 1.05; // Un poco más rápido para sonar dinámico
      window.speechSynthesis.speak(utterance);
    }
  };

  const processIntent = async (text: string) => {
    const lower = text.toLowerCase();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfDay = new Date(now.setHours(0,0,0,0)).toISOString();
    
    // 0. INTENCIÓN: RESUMEN GENERAL (SALUD DEL NEGOCIO)
    if (lower.includes('como me') || lower.includes('como vengo') || lower.includes('resumen') || lower.includes('como va')) {
      try {
        const { data: sales } = await supabase.from('sales').select('total_usd').gte('created_at', startOfMonth);
        const { data: expenses } = await supabase.from('expenses').select('amount_usd, type').gte('created_at', startOfMonth);
        const { count: stockCount } = await supabase.from('devices').select('id', { count: 'exact', head: true }).eq('status', 'Disponible');

        const totalVentas = (sales || []).reduce((acc, s) => acc + Number(s.total_usd || 0), 0);
        const totalGastos = (expenses || []).filter(e => e.type === 'Gasto').reduce((acc, e) => acc + Number(e.amount_usd || 0), 0);
        // Asumimos un 30% de rentabilidad promedio para dar un feedback más realista
        const gananciaBruta = totalVentas * 0.3; 
        const flujoNeto = gananciaBruta - totalGastos;

        let evaluacion = '';
        if (totalVentas === 0) evaluacion = 'Recién arrancamos el mes, ¡hay que activar esas ventas!';
        else if (flujoNeto > 0) evaluacion = '¡Viene siendo un mes excelente y muy rentable, estás superando tus gastos operativos!';
        else evaluacion = 'Tus gastos están superando tu ganancia estimada actual, te sugiero hacer foco en sacar stock estancado.';

        return { text: `Te cuento cómo venís este mes: llevás facturados $${totalVentas.toLocaleString('en-US')} USD y tuviste gastos por $${totalGastos.toLocaleString('en-US')} USD. ${evaluacion} Además tenés un respaldo de ${stockCount || 0} equipos listos para vender en inventario.` };
      } catch (e) {
        return { text: 'Hubo un error al calcular el estado general de tu negocio.' };
      }
    }

    // 1. INTENCIÓN: NAVEGACIÓN
    if (lower.includes('abrir') || lower.includes('ir a') || lower.includes('llevame')) {
      if (lower.includes('reporte') || lower.includes('analytics')) return { text: 'Abriendo reportes...', actionType: 'link', actionUrl: '/reportes', actionText: 'Ir a Reportes' };
      if (lower.includes('caja') || lower.includes('gasto') || lower.includes('finanza')) return { text: 'Abriendo el módulo de finanzas.', actionType: 'link', actionUrl: '/finance', actionText: 'Ir a Caja' };
      if (lower.includes('stock') || lower.includes('inventario') || lower.includes('equipo')) return { text: 'Abriendo tu inventario.', actionType: 'link', actionUrl: '/devices', actionText: 'Ir a Inventario' };
      if (lower.includes('cliente')) return { text: 'Abriendo clientes.', actionType: 'link', actionUrl: '/customers', actionText: 'Ir a Clientes' };
    }

    // 2. INTENCIÓN: NUEVA VENTA
    if (lower.includes('cargar venta') || lower.includes('nueva venta') || lower.includes('vender')) {
      return {
        text: '¡Excelente! Vamos a registrar esa operación. Hacé clic abajo para abrir el formulario.',
        actionType: 'link' as const,
        actionUrl: '/sales',
        actionText: 'Crear Venta'
      };
    }

    // 3. INTENCIÓN: RESUMEN DE VENTAS (Hoy o Mes)
    if (lower.includes('cuanto vendi') || lower.includes('ventas') || lower.includes('factura')) {
      try {
        const isToday = lower.includes('hoy') || lower.includes('dia') || lower.includes('día');
        const filterDate = isToday ? startOfDay : startOfMonth;
        const timeFrame = isToday ? 'hoy' : 'este mes';

        const { data: sales } = await supabase.from('sales').select('total_usd').gte('created_at', filterDate);
        if (!sales || sales.length === 0) return { text: `Todavía no tenés ventas registradas ${timeFrame}.` };

        const total = sales.reduce((acc, s) => acc + Number(s.total_usd || 0), 0);
        return { text: `Llevás facturado $${total.toLocaleString('en-US')} USD en ${sales.length} operaciones ${timeFrame}.` };
      } catch (e) {
        return { text: 'Error al calcular las ventas.' };
      }
    }

    // 4. INTENCIÓN: GASTOS
    if (lower.includes('gasto') || lower.includes('gaste') || lower.includes('egreso')) {
      try {
        const { data: expenses } = await supabase.from('expenses').select('amount_usd, type').gte('created_at', startOfMonth);
        const gastos = (expenses || []).filter(e => e.type === 'Gasto').reduce((acc, e) => acc + Number(e.amount_usd || 0), 0);
        return { text: `Tus gastos operativos este mes suman un total de $${gastos.toLocaleString('en-US')} USD.` };
      } catch (e) {
        return { text: 'Error al consultar los gastos.' };
      }
    }

    // 5. INTENCIÓN: PRECIOS
    if (lower.includes('precio') || lower.includes('cuanto sale') || lower.includes('cuanto cuesta')) {
      try {
        const words = lower.split(' ');
        const idx = words.findIndex(w => w === 'iphone' || w === 'cargador' || w === 'macbook');
        let queryModel = '';
        if (idx !== -1) {
          queryModel = `${words[idx]} ${words[idx+1] || ''} ${words[idx+2] || ''}`.trim();
        }

        const { data: devices } = await supabase.from('devices').select('suggested_price_usd, products(model)').eq('status', 'Disponible');
        
        if (!devices || devices.length === 0) return { text: 'No hay equipos disponibles para consultar precio.' };
        
        let match = devices;
        if (queryModel) {
          match = devices.filter(d => (d.products as any)?.model?.toLowerCase().includes(queryModel.toLowerCase()));
          if (match.length > 0) {
            const price = match[0].suggested_price_usd;
            return { text: `El precio de venta sugerido para el ${(match[0].products as any).model} es de $${price} USD.` };
          }
          return { text: `No encontré el precio para "${queryModel}" en el inventario activo.` };
        }
        return { text: `Tengo los precios de ${devices.length} productos distintos. Especificame un modelo, por ejemplo "precio del iPhone 13".` };
      } catch (e) {
        return { text: 'Error al consultar precios.' };
      }
    }

    // 6. INTENCIÓN: STOCK GENERAL O ESPECÍFICO
    if (lower.includes('stock') || lower.includes('cuanto') || lower.includes('quedan') || lower.includes('hay')) {
      try {
        const { data: devices } = await supabase
          .from('devices')
          .select('status, products(model, capacity)')
          .eq('status', 'Disponible');

        if (!devices || devices.length === 0) return { text: 'Actualmente el inventario está vacío.' };

        const words = lower.split(' ');
        let queryModel = '';

        if (lower.includes('iphone')) {
          const idx = words.indexOf('iphone');
          if (idx !== -1 && words[idx+1]) {
            queryModel = `iphone ${words[idx+1]}`;
            if (words[idx+2] && (words[idx+2] === 'pro' || words[idx+2] === 'plus' || words[idx+2] === 'max')) {
              queryModel += ` ${words[idx+2]}`;
            }
          }
        }

        let match = devices;
        if (queryModel) {
          match = devices.filter(d => (d.products as any)?.model?.toLowerCase().includes(queryModel));
        }

        if (queryModel && match.length > 0) {
          const capacities: Record<string, number> = {};
          match.forEach(d => {
            const cap = (d.products as any)?.capacity || 'Sin dif.';
            capacities[cap] = (capacities[cap] || 0) + 1;
          });
          
          let breakdown = Object.entries(capacities).map(([cap, qty]) => `${qty} en ${cap}`).join(', ');
          return { text: `Tenés ${match.length} unidades de ${queryModel} disponibles: ${breakdown}.` };
        } else if (queryModel) {
          return { text: `Actualmente no tenés stock de ${queryModel}.` };
        } else {
          return { text: `Tu inventario general cuenta con ${devices.length} equipos activos listos para la venta.` };
        }
      } catch (e) {
        return { text: 'Hubo un error al consultar el inventario.' };
      }
    }

    // Default
    return { text: 'Soy una IA enfocada en tu negocio. Preguntame por stock, precios, ventas del día o decime a qué módulo querés ir.' };
  };

  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || inputValue;
    if (!textToSend.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsProcessing(true);

    const botResponseData = await processIntent(textToSend);
    
    const botMsg: Message = {
      id: (Date.now() + 1).toString(),
      sender: 'bot',
      ...botResponseData as any
    };

    setMessages(prev => [...prev, botMsg]);
    setIsProcessing(false);
    
    // Hablar respuesta
    speakText(botMsg.text);
  };

  return (
    <>
      {/* Botón Flotante */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-tr from-purple-600 to-indigo-500 rounded-full shadow-2xl flex items-center justify-center hover:scale-105 transition-transform z-50 group border border-purple-400/30"
        >
          <Bot className="w-6 h-6 text-white group-hover:animate-pulse" />
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 border-2 border-[#0b0b0e] rounded-full shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse"></span>
        </button>
      )}

      {/* Ventana del Chat */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[350px] sm:w-[400px] h-[500px] max-h-[80vh] bg-[#121216] border border-purple-500/30 rounded-2xl shadow-[0_0_40px_rgba(168,85,247,0.15)] flex flex-col z-50 overflow-hidden animate-in slide-in-from-bottom-5">
          
          {/* Header */}
          <div className="bg-[#1a1a24] border-b border-white/5 p-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center shadow-inner">
                  <Bot className="w-5 h-5 text-purple-400" />
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-[#1a1a24] rounded-full"></span>
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">iA Assistant</h3>
                <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Conectado al ERP
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setSoundEnabled(!soundEnabled)} 
                className="text-slate-400 hover:text-white p-1.5 rounded-md hover:bg-white/5 transition-colors"
                title={soundEnabled ? "Desactivar voz" : "Activar voz"}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white p-1.5 rounded-md hover:bg-white/5 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0b0b0e]/50">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-md ${
                  msg.sender === 'user' 
                    ? 'bg-purple-600 text-white rounded-br-none' 
                    : 'bg-[#1e1e24] border border-white/5 text-slate-200 rounded-bl-none'
                }`}>
                  <p>{msg.text}</p>
                  
                  {msg.actionType === 'link' && msg.actionUrl && (
                    <div className="mt-3">
                      <button 
                        onClick={() => router.push(msg.actionUrl!)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-lg border border-emerald-500/20 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {msg.actionText}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-[#1e1e24] border border-white/5 rounded-2xl rounded-bl-none p-4 shadow-md flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce"></span>
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{animationDelay: '150ms'}}></span>
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{animationDelay: '300ms'}}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-[#1a1a24] border-t border-white/5">
            <div className="flex items-end gap-2 bg-[#0b0b0e] border border-white/10 rounded-xl p-1 focus-within:border-purple-500/50 transition-colors">
              <button 
                onClick={toggleListen}
                className={`p-2 rounded-lg transition-colors ${
                  isListening ? 'bg-rose-500/20 text-rose-500 animate-pulse' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
                title="Dictar por voz"
              >
                <Mic className="w-5 h-5" />
              </button>
              
              <input 
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={isListening ? 'Escuchando...' : 'Escribí un comando...'}
                className="flex-1 bg-transparent border-none text-sm text-white focus:outline-none py-2.5 min-w-0"
              />

              <button 
                onClick={() => handleSend()}
                disabled={!inputValue.trim()}
                className="p-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
