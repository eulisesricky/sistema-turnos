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

interface Product {
  id: string;
  name: string;
  estimated_minutes: number;
}

const DEFAULT_QUEUE_ID = process.env.NEXT_PUBLIC_QUEUE_ID || 'default-queue-id';
const DEFAULT_BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID || 'default-business-id';

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
  const [products, setProducts] = useState<Product[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [orderDescription, setOrderDescription] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [newProductName, setNewProductName] = useState('');
  const [newProductMinutes, setNewProductMinutes] = useState('');
  const [loading, setLoading] = useState(false);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedItems = useMemo(
    () => products.filter((product) => selectedProducts.includes(product.id)),
    [products, selectedProducts]
  );

  const estimatedMinutes = useMemo(
    () => selectedItems.reduce((total, product) => total + product.estimated_minutes, 0),
    [selectedItems]
  );

  const selectedCode = useMemo(
    () => selectedItems.map((product) => product.name.slice(0, 2).toUpperCase()).join(''),
    [selectedItems]
  );

  const fetchTurns = async () => {
    const { data, error } = await supabase
      .from('turns')
      .select('id, customer_name, whatsapp, turn_number, status, created_at, estimated_wait_minutes')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .in('status', ['waiting', 'called'])
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error.message);
      return;
    }

    setTurns(data ?? []);
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, estimated_minutes')
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .order('name', { ascending: true });

    if (error) {
      console.error(error.message);
      return;
    }

    setProducts(data ?? []);
  };

  useEffect(() => {
    fetchTurns();
    fetchProducts();

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

  const handleAddProduct = async () => {
    if (!newProductName.trim() || !newProductMinutes.trim()) {
      setErrorMessage('Ingresa nombre y tiempo del producto.');
      return;
    }

    const minutes = parseInt(newProductMinutes);
    if (isNaN(minutes) || minutes <= 0) {
      setErrorMessage('El tiempo debe ser un número positivo.');
      return;
    }

    const { error } = await supabase.from('products').insert([
      {
        name: newProductName.trim(),
        estimated_minutes: minutes,
        business_id: DEFAULT_BUSINESS_ID,
      },
    ]);

    if (error) {
      console.log('Error al insertar producto:', error);
      setErrorMessage(`Error al agregar producto: ${error.message}`);
      return;
    }

    setNewProductName('');
    setNewProductMinutes('');
    fetchProducts();
  };

  const handleDeleteProduct = async (productId: string) => {
    const { error } = await supabase.from('products').delete().eq('id', productId);

    if (error) {
      console.error(error.message);
      setErrorMessage('Error al eliminar producto.');
      return;
    }

    fetchProducts();
    setSelectedProducts((current) => current.filter((id) => id !== productId));
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
      .eq('business_id', DEFAULT_BUSINESS_ID)
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString());

    if (countError) {
      console.error(countError.message);
      setErrorMessage('Error al calcular el número de turno.');
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
      setErrorMessage('Error al registrar el turno.');
      setLoading(false);
      return;
    }

    setSuccessUrl(`https://sistema-turnos-nine.vercel.app/turno?token=${token}`);
    setCustomerName('');
    setWhatsapp('');
    setOrderDescription('');
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
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Panel del Cajero</h1>
            <p className="text-sm text-slate-600">Gestiona productos y registra turnos con separación por negocio.</p>
          </div>
          <button
            type="button"
            onClick={openTV}
            className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Abrir pantalla TV
          </button>
        </header>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold mb-4">Mis Productos</h2>

            <div className="mb-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">Agregar producto</p>
              <div className="flex gap-3">
                <input
                  value={newProductName}
                  onChange={(event) => setNewProductName(event.target.value)}
                  className="flex-1 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
                  placeholder="Nombre del producto"
                />
                <input
                  value={newProductMinutes}
                  onChange={(event) => setNewProductMinutes(event.target.value)}
                  className="w-20 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
                  placeholder="Min"
                  type="number"
                />
                <button
                  type="button"
                  onClick={handleAddProduct}
                  className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  Agregar
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {products.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-500">
                  No hay productos registrados.
                </div>
              ) : (
                products.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500">{product.estimated_minutes} min</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(product.id)}
                      className="rounded-2xl bg-rose-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-500"
                    >
                      Eliminar
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold mb-4">Registrar turno</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
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

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Descripción del pedido</label>
                <textarea
                  value={orderDescription}
                  onChange={(event) => setOrderDescription(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-emerald-500"
                  placeholder="Ej. 2 pizzas grandes, 1 bebida"
                  rows={3}
                />
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">Seleccionar productos</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {products.map((product) => (
                    <label key={product.id} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(product.id)}
                        onChange={() => handleProductToggle(product.id)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm text-slate-700">
                        {product.name} ({product.estimated_minutes} min)
                      </span>
                    </label>
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
                className="w-full rounded-2xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-400"
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
        </div>

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
