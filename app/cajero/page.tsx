'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Turn {
  id: string;
  customer_name: string;
  whatsapp: string;
  turn_number: string;
  status: 'waiting' | 'called' | 'completed' | 'cancelled';
  estimated_wait_minutes: number;
  created_at: string;
}

const DEFAULT_QUEUE_ID = process.env.NEXT_PUBLIC_QUEUE_ID || 'default-queue-id';
const DEFAULT_BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID || 'default-business-id';

const products = [
  { id: 'PG', label: 'Pizza Grande', minutes: 18 },
  { id: 'PP', label: 'Pizza Pequeña', minutes: 12 },
  { id: 'PA', label: 'Pan de Ajo', minutes: 8 },
  { id: 'BE', label: 'Bebida', minutes: 4 },
];

const productOrder = ['PG', 'PP', 'PA', 'BE'];

const translateStatus = (status: Turn['status']) => {
  switch (status) {
    case 'waiting':
      return 'En espera';
    case 'called':
      return 'Llamado';
    case 'completed':
      return 'Completado';
    case 'cancelled':
      return 'Cancelado';
    default:
      return 'Desconocido';
  }
};

export default function CajeroPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedItems = useMemo(
    () => products
      .filter((product) => selectedProducts.includes(product.id))
      .sort((a, b) => productOrder.indexOf(a.id) - productOrder.indexOf(b.id)),
    [selectedProducts]
  );

  const estimatedMinutes = useMemo(
    () => selectedItems.reduce((total, product) => total + product.minutes, 0),
    [selectedItems]
  );

  const selectedCode = useMemo(
    () => selectedItems.map((product) => product.id).join(''),
    [selectedItems]
  );

  const fetchTurns = async () => {
    const { data, error } = await supabase
      .from('turns')
      .select('id, customer_name, whatsapp, turn_number, status, created_at, estimated_wait_minutes')
      .in('status', ['waiting', 'called'])
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error.message);
      return;
    }

    setTurns(data ?? []);
  };

  useEffect(() => {
    fetchTurns();

    const channel = supabase
      .channel('turns-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turns' },
        () => {
          fetchTurns();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleProductToggle = (productId: string) => {
    setSelectedProducts((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
    setErrorMessage(null);
    setSuccessUrl(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!customerName.trim()) {
      setErrorMessage('Ingresa el nombre del cliente.');
      return;
    }

    if (selectedItems.length === 0) {
      setErrorMessage('Selecciona al menos un producto.');
      return;
    }

    setSuccessUrl(null);
    setErrorMessage(null);
    setLoading(true);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const { count, error: countError } = await supabase
      .from('turns')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString());

    if (countError) {
      console.error(countError.message);
      setLoading(false);
      return;
    }

    const sequenceNumber = (count ?? 0) + 1;
    const turnNumber = `${selectedCode}${String(sequenceNumber).padStart(3, '0')}`;
    const token = Math.random().toString(36).slice(2, 12);

    const { error } = await supabase.from('turns').insert([
      {
        customer_name: customerName,
        whatsapp,
        turn_number: turnNumber,
        status: 'waiting',
        estimated_wait_minutes: estimatedMinutes,
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
    setSelectedProducts([]);
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
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Panel del Cajero</h1>
            <p className="text-sm text-slate-600">Registra turnos con productos, tiempos y numeración inteligente.</p>
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
          <form onSubmit={handleSubmit} className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">Selecciona productos</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleProductToggle(product.id)}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${selectedProducts.includes(product.id)
                      ? 'border-emerald-500 bg-emerald-500/10 text-slate-900'
                      : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-lg font-semibold">{product.label}</span>
                      <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">{product.id}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{product.minutes} min estimado</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">Resumen</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Código del turno</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">{selectedCode || 'Sin productos'}</p>
                </div>
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tiempo estimado</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">{estimatedMinutes} min</p>
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {errorMessage}
              </div>
            )}

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
                    <p className="text-sm text-slate-500">Estado: {translateStatus(turn.status)}</p>
                    <p className="text-sm text-slate-500">Tiempo estimado: {turn.estimated_wait_minutes} min</p>
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
