'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Turn {
  id: string;
  customer_name: string;
  whatsapp: string;
  turn_number: number;
  status: 'waiting' | 'called' | 'completed' | 'cancelled';
  created_at: string;
}

const DEFAULT_QUEUE_ID = process.env.NEXT_PUBLIC_QUEUE_ID || 'default-queue-id';
const DEFAULT_BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID || 'default-business-id';

export default function CajeroPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [loading, setLoading] = useState(false);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);

  const fetchTurns = async () => {
    const { data, error } = await supabase
      .from('turns')
      .select('id, customer_name, whatsapp, turn_number, status, created_at')
      .in('status', ['waiting', 'called'])
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error.message);
      return;
    }

    setTurns(data ?? []);
  };

  useEffect(() => {
    fetchTurns()
  
    const channel = supabase
      .channel('turns-channel')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'turns' },
        () => { fetchTurns() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customerName.trim()) return;

    setSuccessUrl(null);
    setLoading(true);

    const { data: latestTurn, error: latestError } = await supabase
      .from('turns')
      .select('turn_number')
      .order('turn_number', { ascending: false })
      .limit(1)
      .single();

    if (latestError && latestError.code !== 'PGRST116') {
      console.error(latestError.message);
      setLoading(false);
      return;
    }

    const nextTurnNumber = (latestTurn?.turn_number ?? 0) + 1;
    const token = Math.random().toString(36).slice(2, 12);

    const { error } = await supabase.from('turns').insert([
      {
        customer_name: customerName,
        whatsapp,
        turn_number: nextTurnNumber,
        status: 'waiting',
        estimated_wait_minutes: 0,
        token,
        queue_id: DEFAULT_QUEUE_ID,
        business_id: DEFAULT_BUSINESS_ID,
      },
    ]);

    if (error) {
      console.error(error.message);
      setLoading(false);
      return;
    }

    setSuccessUrl(`https://sistema-turnos-nine.vercel.app/turno?token=${token}`);
    setCustomerName('');
    setWhatsapp('');
    setLoading(false);
  };

  const updateTurnStatus = async (id: string, status: Turn['status']) => {
    const { error } = await supabase
      .from('turns')
      .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
      .eq('id', id);

    if (error) {
      console.error(error.message);
    }
  };

  const openTV = () => {
    window.open('/tv', '_blank');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Panel del Cajero</h1>
            <p className="text-sm text-slate-600">Registra turnos y gestiona el flujo en tiempo real.</p>
          </div>
          <button
            type="button"
            onClick={openTV}
            className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Abrir pantalla TV
          </button>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-4">Registrar turno</h2>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Nombre</label>
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-emerald-500"
                placeholder="Ej. Juan Pérez"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">WhatsApp</label>
              <input
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-emerald-500"
                placeholder="Ej. +5491123456789"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-2xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? 'Registrando...' : 'Registrar turno'}
            </button>
          </form>
          {successUrl && (
            <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-sm font-medium text-emerald-800">Turno registrado exitosamente</p>
              <p className="text-sm text-emerald-700 mt-1">Comparte esta URL con el cliente:</p>
              <a href={successUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-600 underline break-all">
                {successUrl}
              </a>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-4">Turnos activos</h2>
          <div className="space-y-3">
            {turns.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
                No hay turnos activos.
              </div>
            ) : (
              turns.map((turn) => (
                <div
                  key={turn.id}
                  className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-lg font-semibold">#{turn.turn_number} · {turn.customer_name}</p>
                    <p className="text-sm text-slate-600">WhatsApp: {turn.whatsapp || 'No informado'}</p>
                    <p className="text-sm text-slate-500">Estado: {turn.status}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {turn.status === 'waiting' && (
                      <button
                        type="button"
                        onClick={() => updateTurnStatus(turn.id, 'called')}
                        className="rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-400"
                      >
                        Llamar
                      </button>
                    )}
                    {turn.status === 'called' && (
                      <button
                        type="button"
                        onClick={() => updateTurnStatus(turn.id, 'completed')}
                        className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                      >
                        Completar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => updateTurnStatus(turn.id, 'cancelled')}
                      className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
