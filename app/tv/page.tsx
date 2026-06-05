'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { APP_VERSION } from '@/lib/version';

interface Turn {
  id: string;
  customer_name: string;
  turn_number: number;
  status: 'waiting' | 'called' | 'completed' | 'cancelled';
  created_at: string;
}

const QR_URL = 'https://sistema-turnos-nine.vercel.app/r';

export default function TVPage() {
  const [currentTurn, setCurrentTurn] = useState<Turn | null>(null);
  const [nextTurns, setNextTurns] = useState<Turn[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const fetchTurns = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('turns')
      .select('id, customer_name, turn_number, status, created_at')
      .eq('business_id', process.env.NEXT_PUBLIC_BUSINESS_ID)
      .in('status', ['waiting', 'called'])
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error.message);
      return;
    }

    const calledTurn = data?.find((turn) => turn.status === 'called') ?? null;
    const waitingTurns = data?.filter((turn) => turn.status === 'waiting').slice(0, 6) ?? [];

    setCurrentTurn(calledTurn);
    setNextTurns(waitingTurns);
  };

  useEffect(() => {
    fetchTurns();

    const supabase = createClient();
    const channel = supabase
      .channel('turns-channel')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'turns' },
        () => { fetchTurns(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-slate-950 text-white" style={{ padding: 'clamp(0.6rem, 1.2vw, 1.25rem)' }}>

      {/* Header compacto */}
      <header className="flex-shrink-0 flex items-center justify-between" style={{ marginBottom: 'clamp(0.4rem, 0.7vw, 0.75rem)' }}>
        <h1 className="font-black tracking-tight" style={{ fontSize: 'clamp(1.4rem, 2.8vw, 3.5rem)' }}>
          Sistema de Turnos
        </h1>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center rounded-full bg-emerald-500/15 font-semibold text-emerald-300"
            style={{ fontSize: 'clamp(0.6rem, 0.9vw, 0.85rem)', padding: '0.25rem 0.75rem' }}
          >
            ● En vivo
          </span>
          <span className="text-slate-500 font-mono" style={{ fontSize: 'clamp(0.5rem, 0.75vw, 0.75rem)' }}>
            {APP_VERSION}
          </span>
        </div>
      </header>

      {/* Cuerpo principal — dos columnas, llena el resto de la pantalla */}
      <div
        className="flex-1 grid overflow-hidden"
        style={{ gridTemplateColumns: '3fr 2fr', gap: 'clamp(0.4rem, 0.7vw, 0.75rem)' }}
      >
        {/* IZQUIERDA: turno actual */}
        <section
          className="flex flex-col rounded-[2rem] border border-slate-800 bg-slate-900/90 shadow-2xl shadow-black/40 overflow-hidden"
          style={{ padding: 'clamp(0.8rem, 1.4vw, 1.5rem)' }}
        >
          <div className="flex-shrink-0 flex items-center justify-between" style={{ marginBottom: 'clamp(0.4rem, 0.7vw, 0.75rem)' }}>
            <div>
              <p className="uppercase tracking-[0.4em] text-slate-400" style={{ fontSize: 'clamp(0.5rem, 0.8vw, 0.85rem)' }}>
                Turno actual
              </p>
              <p className="font-semibold text-white" style={{ fontSize: 'clamp(0.9rem, 1.7vw, 2rem)' }}>
                Llamando ahora
              </p>
            </div>
            <span
              className="inline-flex items-center rounded-full bg-emerald-500/15 font-semibold text-emerald-300"
              style={{ fontSize: 'clamp(0.5rem, 0.8vw, 0.8rem)', padding: '0.2rem 0.6rem' }}
            >
              En vivo
            </span>
          </div>

          <div className="flex-1 flex items-center justify-center rounded-[2rem] border border-emerald-500/20 bg-emerald-500/10 overflow-hidden">
            {currentTurn ? (
              <div className="text-center px-4 w-full">
                <p
                  className="font-black leading-none text-emerald-300"
                  style={{ fontSize: 'clamp(2.5rem, min(11vw, 28vh), 12rem)' }}
                >
                  #{currentTurn.turn_number}
                </p>
                <p
                  className="font-semibold text-white"
                  style={{ fontSize: 'clamp(1rem, 2.5vw, 3rem)', marginTop: 'clamp(0.4rem, 0.7vw, 1rem)' }}
                >
                  {currentTurn.customer_name}
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="font-black text-slate-500" style={{ fontSize: 'clamp(2.5rem, 7vw, 9rem)' }}>
                  ESPERANDO
                </p>
                <p className="text-slate-600" style={{ fontSize: 'clamp(0.7rem, 1.2vw, 1.5rem)', marginTop: '0.5rem' }}>
                  Sin turno activo
                </p>
              </div>
            )}
          </div>
        </section>

        {/* DERECHA: QR + próximos turnos */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ gap: 'clamp(0.4rem, 0.7vw, 0.75rem)' }}
        >
          {/* QR */}
          <section
            className="flex-shrink-0 rounded-[2rem] border border-slate-800 bg-slate-900/90 shadow-2xl shadow-black/40"
            style={{ padding: 'clamp(0.6rem, 1.1vw, 1.25rem)' }}
          >
            <p
              className="uppercase tracking-[0.4em] text-slate-400"
              style={{ fontSize: 'clamp(0.45rem, 0.7vw, 0.75rem)', marginBottom: 'clamp(0.3rem, 0.5vw, 0.6rem)' }}
            >
              QR para celular
            </p>
            <div className="flex items-center" style={{ gap: 'clamp(0.4rem, 0.7vw, 0.9rem)' }}>
              <div
                className="flex-shrink-0 overflow-hidden rounded-2xl bg-white shadow-xl"
                style={{
                  padding: 'clamp(0.3rem, 0.5vw, 0.6rem)',
                  width: 'clamp(110px, 14vw, 210px)',
                  height: 'clamp(110px, 14vw, 210px)',
                }}
              >
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(QR_URL)}&margin=0`}
                  alt="QR Code"
                  className="w-full h-full"
                />
              </div>
              <div className="min-w-0">
                <p
                  className="font-semibold text-slate-200"
                  style={{ fontSize: 'clamp(0.6rem, 1.1vw, 1.2rem)', marginBottom: '0.2rem' }}
                >
                  Escanea para ver tu turno
                </p>
                <p
                  className="font-bold text-white"
                  style={{ fontSize: 'clamp(0.55rem, 1vw, 1rem)', wordBreak: 'break-all' }}
                >
                  {QR_URL}
                </p>
              </div>
            </div>
          </section>

          {/* Próximos turnos */}
          <section
            className="flex-1 flex flex-col rounded-[2rem] border border-slate-800 bg-slate-900/90 shadow-2xl shadow-black/40 overflow-hidden"
            style={{ padding: 'clamp(0.6rem, 1.1vw, 1.25rem)' }}
          >
            <div
              className="flex-shrink-0 flex items-center justify-between"
              style={{ marginBottom: 'clamp(0.3rem, 0.5vw, 0.6rem)' }}
            >
              <div>
                <p className="uppercase tracking-[0.35em] text-slate-400" style={{ fontSize: 'clamp(0.45rem, 0.7vw, 0.75rem)' }}>
                  Próximos turnos
                </p>
                <p className="font-semibold text-white" style={{ fontSize: 'clamp(0.8rem, 1.5vw, 1.8rem)' }}>
                  En espera
                </p>
              </div>
              <span
                className="rounded-full bg-slate-800 font-semibold text-slate-300"
                style={{ fontSize: 'clamp(0.5rem, 0.8vw, 0.85rem)', padding: '0.2rem 0.6rem' }}
              >
                {nextTurns.length} en cola
              </span>
            </div>

            <div
              className="flex-1 grid gap-2 overflow-hidden"
              style={{ gridTemplateColumns: '1fr 1fr', alignContent: 'start' }}
            >
              {nextTurns.length === 0 ? (
                <div className="col-span-2 flex items-center justify-center rounded-3xl border border-dashed border-slate-700 bg-slate-950/80">
                  <p className="text-slate-500" style={{ fontSize: 'clamp(0.65rem, 1.1vw, 1.1rem)' }}>
                    Sin turnos en espera
                  </p>
                </div>
              ) : (
                nextTurns.map((turn) => (
                  <div
                    key={turn.id}
                    className="rounded-3xl border border-slate-800 bg-slate-950/80 transition hover:border-emerald-500"
                    style={{ padding: 'clamp(0.4rem, 0.7vw, 0.75rem)' }}
                  >
                    <p
                      className="font-black text-white leading-none"
                      style={{ fontSize: 'clamp(1.5rem, 3vw, 4rem)' }}
                    >
                      #{turn.turn_number}
                    </p>
                    <p
                      className="font-semibold text-slate-200 truncate"
                      style={{ fontSize: 'clamp(0.55rem, 1vw, 1.1rem)', marginTop: '0.2rem' }}
                    >
                      {turn.customer_name}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Botón pantalla completa */}
      <button
        onClick={toggleFullscreen}
        title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        className="fixed bottom-5 right-5 z-50 rounded-full bg-slate-800/70 p-3 text-slate-300 backdrop-blur-sm transition hover:bg-slate-700 hover:text-white"
      >
        {isFullscreen ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M15 9h4.5M15 9V4.5M15 9l5.25-5.25M9 15H4.5M9 15v4.5M9 15l-5.25 5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        )}
      </button>
    </div>
  );
}
