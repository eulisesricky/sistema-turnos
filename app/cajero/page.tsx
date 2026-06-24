'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION } from '@/lib/version';

function useDraggable() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const start = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    dragging.current = true;
    start.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragging.current) return;
    setPos({
      x: start.current.px + e.clientX - start.current.mx,
      y: start.current.py + e.clientY - start.current.my,
    });
  };

  const onPointerUp = () => { dragging.current = false; };

  return {
    dragHandleProps: { onPointerDown, onPointerMove, onPointerUp },
    modalStyle: {
      position: 'fixed' as const,
      top: '50%',
      left: '50%',
      transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
      zIndex: 51,
      maxHeight: '90vh',
      overflowY: 'auto' as const,
    },
    reset: () => setPos({ x: 0, y: 0 }),
  };
}

interface Turn {
  id: string;
  customer_name: string;
  whatsapp: string;
  pin?: string | null;
  turn_number: string;
  status: 'waiting' | 'called' | 'completed' | 'cancelled';
  estimated_wait_minutes: number;
  prep_minutes?: number | null;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
  estimated_minutes: number;
}

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

const Spin = () => (
  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
  </svg>
);

export default function CajeroPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [newProductName, setNewProductName] = useState('');
  const [newProductMinutes, setNewProductMinutes] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingBtn, setLoadingBtn] = useState<string | null>(null);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [successPin, setSuccessPin] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProductPanelOpen, setIsProductPanelOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingProductName, setEditingProductName] = useState('');
  const [editingProductMinutes, setEditingProductMinutes] = useState('');
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const settingsDrag = useDraggable();
  const productDrag = useDraggable();
  const [parallelCapacity, setParallelCapacity] = useState(2);
  const [bufferPercentage, setBufferPercentage] = useState(20);
  const [displayMode, setDisplayMode] = useState<'timer' | 'queue' | 'both'>('timer');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const selectedItems = useMemo(
    () => products.filter((product) => selectedProducts.includes(product.id)),
    [products, selectedProducts]
  );

  const estimatedMinutes = useMemo(
    () => selectedItems.reduce((total, product) => total + product.estimated_minutes, 0),
    [selectedItems]
  );

  const selectedCode = useMemo(() => {
    const normalize = (name: string) => name.trim().toUpperCase();
    const twoLetterCode = (name: string) => {
      const words = normalize(name).split(/\s+/).filter((w) => w.length > 0);
      if (words.length >= 2) {
        return `${words[0][0]}${words[1][0]}`;
      }
      return words[0]?.slice(0, 2) ?? '';
    };
    const firstLetterCode = (name: string) => {
      const words = normalize(name).split(/\s+/).filter((w) => w.length > 0);
      return words[0]?.[0] ?? '';
    };

    if (selectedItems.length === 1) {
      return twoLetterCode(selectedItems[0].name);
    }

    if (selectedItems.length === 2) {
      return selectedItems.map((product) => twoLetterCode(product.name)).join('').slice(0, 4);
    }

    return selectedItems
      .slice(0, 4)
      .map((product) => firstLetterCode(product.name))
      .join('')
      .slice(0, 4);
  }, [selectedItems]);

  const formatRemainingSeconds = (seconds: number) => {
    const remaining = Math.max(0, seconds);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const fetchTurns = async () => {
    try {
      const res = await fetch('/api/turns');
      const data = await res.json();
      if (!res.ok) {
        console.error(data?.error ?? 'Error al cargar turnos');
        return;
      }
      setTurns(data ?? []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (!res.ok) {
        console.error(data?.error ?? 'Error al cargar productos');
        return;
      }
      setProducts(data ?? []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (!res.ok) {
        console.error('Error loading settings:', data?.error);
        return;
      }
      if (data) {
        setParallelCapacity(data.parallel_capacity ?? 2);
        setBufferPercentage(data.buffer_percentage ?? 20);
        setDisplayMode((data.display_mode as 'timer' | 'queue') ?? 'timer');
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTurns();
    fetchProducts();
    fetchSettings();

    // Reemplazo del realtime de Supabase: sondeo cada 5 segundos.
    const interval = setInterval(() => {
      fetchTurns();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000);

    return () => clearInterval(interval);
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

    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newProductName.trim(), estimated_minutes: minutes }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      console.log('Error al insertar producto:', data);
      setErrorMessage(`Error al agregar producto: ${data?.error ?? 'desconocido'}`);
      return;
    }

    setNewProductName('');
    setNewProductMinutes('');
    fetchProducts();
  };

  const handleDeleteProduct = async (productId: string) => {
    const confirmed = window.confirm('¿Eliminar este producto?');
    if (!confirmed) {
      return;
    }

    const res = await fetch(`/api/products?id=${encodeURIComponent(productId)}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      console.error(data?.error ?? 'Error al eliminar producto');
      setErrorMessage('Error al eliminar producto.');
      return;
    }

    fetchProducts();
    setSelectedProducts((current) => current.filter((id) => id !== productId));
  };

  const handleSaveProductEdit = async () => {
    if (!editingProductId || !editingProductName.trim() || !editingProductMinutes) return;
    const res = await fetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingProductId,
        name: editingProductName.trim(),
        estimated_minutes: Number(editingProductMinutes),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      console.error(data?.error ?? 'Error al guardar cambios');
      setErrorMessage('Error al guardar cambios.');
      return;
    }
    setEditingProductId(null);
    fetchProducts();
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

    const countRes = await fetch(
      `/api/turns/count?from=${encodeURIComponent(today.toISOString())}&to=${encodeURIComponent(tomorrow.toISOString())}`
    );
    const countJson = await countRes.json().catch(() => null);
    if (!countRes.ok) {
      console.error(countJson?.error ?? 'Error al contar turnos');
      setErrorMessage('Error al calcular el número de turno.');
      setLoading(false);
      return;
    }
    const count: number = countJson?.count ?? 0;

    const activeRes = await fetch('/api/turns/active');
    const turnosActivos = await activeRes.json().catch(() => null);
    if (!activeRes.ok) {
      console.error(turnosActivos?.error ?? 'Error al calcular el tiempo de espera');
      setErrorMessage('Error al calcular el tiempo de espera.');
      setLoading(false);
      return;
    }

    const capacity = parallelCapacity || 2;
    const buffer = bufferPercentage || 20;
    const tiempoProducto = estimatedMinutes;
    const tiempoBase = tiempoProducto * (1 + buffer / 100);
    const prepMinutes = Math.max(1, Math.ceil(tiempoBase));
    const turnosEnCola = turnosActivos?.length || 0;
    const turnosEsperando = Math.floor(turnosEnCola / capacity);
    const tiempoFinal = Math.max(prepMinutes, Math.round(tiempoBase + turnosEsperando * tiempoBase));

    const sequenceNumber = (count ?? 0) + 1;
    const turnNumber = `${selectedCode}${String(sequenceNumber).padStart(3, '0')}`;
    const token = Math.random().toString(36).substr(2, 9);
    const pin = !whatsapp.trim() ? Math.floor(1000 + Math.random() * 9000).toString() : null;

    const insertRes = await fetch('/api/turns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: customerName,
        whatsapp,
        pin,
        turn_number: turnNumber,
        estimated_wait_minutes: tiempoFinal,
        prep_minutes: prepMinutes,
        token,
      }),
    });

    if (!insertRes.ok) {
      const data = await insertRes.json().catch(() => null);
      console.log('Error al registrar turno:', data);
      setErrorMessage(`Error al registrar el turno: ${data?.error ?? 'desconocido'}`);
      setLoading(false);
      return;
    }

    setSuccessUrl(`https://sistema-turnos-nine.vercel.app/turno?token=${token}`);
    setSuccessPin(pin);
    setCustomerName('');
    setWhatsapp('');
    setSelectedProducts([]);
    setLoading(false);
  };

  const adjustTurnTime = async (id: string, deltaMinutes: number, currentEstimated: number) => {
    setLoadingBtn(`${id}-adj${deltaMinutes}`);
    try {
      const thisTurn = turns.find((t) => t.id === id)
      // Piso: el ajuste nunca puede bajar el estimado por debajo del prep_minutes del turno
      const piso = thisTurn?.prep_minutes && thisTurn.prep_minutes > 0 ? thisTurn.prep_minutes : 1
      const newEstimated = Math.max(piso, Math.round(currentEstimated + deltaMinutes))
      const res = await fetch('/api/turns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, estimated_wait_minutes: newEstimated }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        console.error('Error al ajustar tiempo:', data?.error)
        return
      }

      // Cascade: sumar el mismo delta a todos los turnos en espera posteriores
      if (!thisTurn) return
      const subsequent = turns.filter(
        (t) => t.status === 'waiting' && t.created_at > thisTurn.created_at
      )
      for (const turn of subsequent) {
        const pisoTurn = turn.prep_minutes && turn.prep_minutes > 0 ? turn.prep_minutes : 1
        const newEst = Math.max(pisoTurn, Math.round(turn.estimated_wait_minutes + deltaMinutes))
        await fetch('/api/turns', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: turn.id, estimated_wait_minutes: newEst }),
        })
      }
      fetchTurns();
    } finally {
      setLoadingBtn(null);
    }
  }

  const recalcAfterRemoval = async (removedCreatedAt: string) => {
    const res = await fetch('/api/turns');
    const allActive = await res.json().catch(() => null);
    if (!res.ok || !allActive) {
      console.error('Error al obtener turnos activos:', allActive?.error);
      return;
    }

    const capacity = parallelCapacity || 2;

    for (let newIndex = 0; newIndex < allActive.length; newIndex++) {
      const turn = allActive[newIndex];
      if (turn.status !== 'waiting') continue;
      // Turnos anteriores al eliminado no cambian de posición
      if (turn.created_at <= removedCreatedAt) continue;

      // Este turno estaba después del eliminado: su índice original era newIndex + 1
      const origIndex = newIndex + 1;
      const origSlots = Math.floor(origIndex / capacity);
      const newSlots = Math.floor(newIndex / capacity);

      // Si el turno NO cambia de slot (sigue paralelo en el mismo batch),
      // no recalcular: su prep ya está corriendo desde su creación.
      if (newSlots === origSlots) continue;

      const tiempoBase = turn.prep_minutes && turn.prep_minutes > 0
        ? turn.prep_minutes
        : turn.estimated_wait_minutes / (origSlots + 1);

      const calculado = Math.round(tiempoBase * (newSlots + 1));

      const elapsedSeconds = (Date.now() - new Date(turn.created_at).getTime()) / 1000;
      const pisoConElapsed = Math.ceil(tiempoBase + elapsedSeconds / 60);
      const nuevoTiempo = Math.max(calculado, pisoConElapsed);

      await fetch('/api/turns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: turn.id, estimated_wait_minutes: nuevoTiempo }),
      });
    }
  };

  const updateTurnStatus = async (id: string, status: Turn['status']) => {
    setLoadingBtn(`${id}-${status}`);
    try {
      const thisTurn = turns.find((t) => t.id === id);

      if (status === 'completed' || status === 'cancelled') {
        const res = await fetch('/api/turns', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            status,
            completed_at: status === 'completed' ? new Date().toISOString() : null,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          console.error(data?.error ?? 'Error al actualizar turno');
          return;
        }
        if (thisTurn) await recalcAfterRemoval(thisTurn.created_at);
      } else {
        const res = await fetch('/api/turns', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status, completed_at: null }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          console.error(data?.error ?? 'Error al actualizar turno');
          return;
        }
      }

      fetchTurns();
    } finally {
      setLoadingBtn(null);
    }
  };

  const openTV = () => {
    const w = window.screen.availWidth;
    const h = window.screen.availHeight;
    window.open('/tv', 'TVScreen', `width=${w},height=${h},left=0,top=0,menubar=no,toolbar=no,location=no,status=no,scrollbars=no`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      {(settingsSaved || settingsError) && (
        <div
          style={{
            position: 'fixed', top: '1.5rem', left: '50%', transform: 'translateX(-50%)',
            zIndex: 9999, background: settingsError ? '#dc2626' : '#16a34a', color: 'white',
            padding: '1rem 2rem', borderRadius: '1rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            fontSize: '1.05rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            whiteSpace: 'nowrap',
          }}
        >
          {settingsError ? `✗ Error: ${settingsError}` : '✓ Configuración guardada correctamente'}
        </div>
      )}
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Panel del Cajero</h1>
            <p className="text-sm text-slate-600">Gestiona productos y registra turnos con separación por negocio. <span className="font-mono text-slate-400">{APP_VERSION}</span></p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setIsSettingsPanelOpen(true)}
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              ⚙ Configuración
            </button>
            <button
              type="button"
              onClick={() => setIsProductPanelOpen(true)}
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              ⚙ Gestionar productos
            </button>
            <button
              type="button"
              onClick={openTV}
              className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Abrir pantalla TV
            </button>
          </div>
        </header>

        <div className="space-y-8">
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
            <div className="mt-6 text-sm text-slate-500">Capacidad paralela: {parallelCapacity} · Colchón: {bufferPercentage}%</div>
            </form>

            {successUrl && (
              <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
                <p className="text-sm font-medium text-emerald-800">Turno registrado exitosamente</p>
                <p className="text-sm text-emerald-700 mt-1">Comparte esta URL con el cliente:</p>
                <a href={successUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-600 underline break-all">
                  {successUrl}
                </a>
                {successPin && (
                  <p className="mt-3 text-sm font-semibold text-slate-700">PIN del cliente: {successPin}</p>
                )}
                {successPin && (
                  <p className="text-sm text-slate-600">Dígaselo al cliente para que pueda ver su turno.</p>
                )}
              </div>
            )}
          </section>

          {isSettingsPanelOpen && (
            <>
              <div
                className="fixed inset-0 z-50 bg-slate-950/80"
                onClick={() => { setIsSettingsPanelOpen(false); setSettingsSaved(false); setSettingsError(null); settingsDrag.reset(); }}
              />
              <div
                className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl"
                style={settingsDrag.modalStyle}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="mb-5 flex cursor-grab items-center justify-between select-none rounded-xl px-1 py-1 hover:bg-slate-50 active:cursor-grabbing"
                  {...settingsDrag.dragHandleProps}
                >
                  <div>
                    <p className="text-xs text-slate-400 mb-1">⠿ Arrastra para mover</p>
                    <h2 className="text-2xl font-semibold">Configuración</h2>
                    <p className="text-sm text-slate-500">Ajusta la capacidad y el colchón de tiempo.</p>
                  </div>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => { setIsSettingsPanelOpen(false); setSettingsSaved(false); setSettingsError(null); settingsDrag.reset(); }}
                    className="cursor-pointer text-slate-500 transition hover:text-slate-900"
                  >
                    Cerrar
                  </button>
                </div>

                <div className="grid gap-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Órdenes simultáneas</label>
                    <input
                      type="number"
                      min={1}
                      value={parallelCapacity}
                      onChange={(event) => setParallelCapacity(Number(event.target.value))}
                      className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Colchón de tiempo %</label>
                    <input
                      type="number"
                      min={0}
                      value={bufferPercentage}
                      onChange={(event) => setBufferPercentage(Number(event.target.value))}
                      className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="mb-3 block text-sm font-medium text-slate-700">Vista del cliente</label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setDisplayMode('timer')}
                        className={`rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition ${displayMode === 'timer' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                      >
                        ⏱ Temporizador
                        <p className="mt-1 text-xs font-normal text-slate-400">Cuenta regresiva</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisplayMode('queue')}
                        className={`rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition ${displayMode === 'queue' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                      >
                        🔢 Posición en cola
                        <p className="mt-1 text-xs font-normal text-slate-400">Turnos restantes</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisplayMode('both')}
                        className={`rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition ${displayMode === 'both' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                      >
                        ⏱🔢 Ambos
                        <p className="mt-1 text-xs font-normal text-slate-400">Cola + tiempo</p>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { setIsSettingsPanelOpen(false); setSettingsSaved(false); setSettingsError(null); settingsDrag.reset(); }}
                    className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setSettingsError(null);
                      setSettingsSaved(false);
                      try {
                        const res = await fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            parallel_capacity: parallelCapacity,
                            buffer_percentage: bufferPercentage,
                            display_mode: displayMode,
                          }),
                        });
                        if (!res.ok) {
                          const data = await res.json().catch(() => null);
                          console.error('Error guardando configuración:', data?.error);
                          setSettingsError(data?.error ?? 'desconocido');
                          setTimeout(() => setSettingsError(null), 5000);
                        } else {
                          setSettingsSaved(true);
                          setTimeout(() => setSettingsSaved(false), 3000);
                        }
                      } catch (e: any) {
                        console.error('Excepción guardando configuración:', e);
                        setSettingsError(e?.message ?? 'desconocido');
                        setTimeout(() => setSettingsError(null), 5000);
                      }
                    }}
                    className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
                  >
                    Guardar
                  </button>
                </div>
              </div>
              </div>
            </>
          )}

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
                    <p className="text-lg font-semibold">#{turn.turn_number} · {turn.customer_name}{turn.pin ? ` — PIN: ${turn.pin}` : ''}</p>
                    <p className="text-sm text-slate-600">WhatsApp: {turn.whatsapp || 'No informado'}</p>
                    <p className="text-sm text-slate-500">Estado: {translateStatus(turn.status)}</p>
                    <p className="text-sm text-slate-500">Tiempo estimado: {turn.estimated_wait_minutes} min</p>
                    <p className="text-sm text-slate-500">Cuenta atrás: {formatRemainingSeconds(Math.max(0, turn.estimated_wait_minutes * 60 - Math.floor((currentTime - new Date(turn.created_at).getTime()) / 1000)))}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      {turn.status === 'waiting' && (
                        <button
                          type="button"
                          onClick={() => updateTurnStatus(turn.id, 'called')}
                          disabled={loadingBtn?.startsWith(turn.id) ?? false}
                          className="inline-flex items-center gap-1.5 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:opacity-60"
                        >
                          {loadingBtn === `${turn.id}-called` && <Spin />}
                          Llamar
                        </button>
                      )}
                      {turn.status === 'called' && (
                        <button
                          type="button"
                          onClick={() => updateTurnStatus(turn.id, 'completed')}
                          disabled={loadingBtn?.startsWith(turn.id) ?? false}
                          className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                        >
                          {loadingBtn === `${turn.id}-completed` && <Spin />}
                          Completar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => updateTurnStatus(turn.id, 'cancelled')}
                        disabled={loadingBtn?.startsWith(turn.id) ?? false}
                        className="inline-flex items-center gap-1.5 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
                      >
                        {loadingBtn === `${turn.id}-cancelled` && <Spin />}
                        Cancelar
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400 mr-1">Ajustar:</span>
                      <button
                        type="button"
                        onClick={() => adjustTurnTime(turn.id, -5, turn.estimated_wait_minutes)}
                        disabled={loadingBtn?.startsWith(turn.id) ?? false}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-300 disabled:opacity-60"
                        title="Restar 5 minutos"
                      >
                        {loadingBtn === `${turn.id}-adj-5` && <Spin />}
                        −5 min
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustTurnTime(turn.id, 5, turn.estimated_wait_minutes)}
                        disabled={loadingBtn?.startsWith(turn.id) ?? false}
                        className="inline-flex items-center gap-1 rounded-xl bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-300 disabled:opacity-60"
                        title="Sumar 5 minutos"
                      >
                        {loadingBtn === `${turn.id}-adj5` && <Spin />}
                        +5 min
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustTurnTime(turn.id, 10, turn.estimated_wait_minutes)}
                        disabled={loadingBtn?.startsWith(turn.id) ?? false}
                        className="inline-flex items-center gap-1 rounded-xl bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-200 disabled:opacity-60"
                        title="Sumar 10 minutos por demora"
                      >
                        {loadingBtn === `${turn.id}-adj10` && <Spin />}
                        +10 min
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>

      {isProductPanelOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => { setIsProductPanelOpen(false); productDrag.reset(); }}
          />
          <div
            className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl"
            style={productDrag.modalStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex cursor-grab items-center justify-between select-none rounded-xl px-1 py-1 hover:bg-slate-50 active:cursor-grabbing"
              {...productDrag.dragHandleProps}
            >
              <div>
                <p className="text-xs text-slate-400 mb-1">⠿ Arrastra para mover</p>
                <h2 className="text-2xl font-semibold">Gestionar productos</h2>
                <p className="text-sm text-slate-500">Agrega, elimina y revisa tus productos.</p>
              </div>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => { setIsProductPanelOpen(false); productDrag.reset(); }}
                className="cursor-pointer rounded-full bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700">Agregar producto</p>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      value={newProductName}
                      onChange={(event) => setNewProductName(event.target.value)}
                      className="min-w-0 flex-1 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
                      placeholder="Nombre del producto"
                    />
                    <input
                      value={newProductMinutes}
                      onChange={(event) => setNewProductMinutes(event.target.value)}
                      className="w-20 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500"
                      placeholder="Min"
                      type="number"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddProduct}
                    className="w-full rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
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
                      className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      {editingProductId === product.id ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <input
                              autoFocus
                              value={editingProductName}
                              onChange={(e) => setEditingProductName(e.target.value)}
                              className="min-w-0 flex-1 rounded-2xl border border-emerald-400 bg-white px-3 py-2 text-sm outline-none"
                              placeholder="Nombre"
                            />
                            <input
                              type="number"
                              value={editingProductMinutes}
                              onChange={(e) => setEditingProductMinutes(e.target.value)}
                              className="w-20 rounded-2xl border border-emerald-400 bg-white px-3 py-2 text-sm outline-none"
                              placeholder="Min"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleSaveProductEdit}
                              className="flex-1 rounded-2xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingProductId(null)}
                              className="flex-1 rounded-2xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{product.name}</p>
                            <p className="text-xs text-slate-500">{product.estimated_minutes} min</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProductId(product.id);
                                setEditingProductName(product.name);
                                setEditingProductMinutes(String(product.estimated_minutes));
                              }}
                              className="rounded-2xl bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-300"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(product.id)}
                              className="rounded-2xl bg-rose-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-500"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}


