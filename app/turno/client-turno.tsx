'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface TurnData {
  id: string;
  customer_name: string;
  turn_number: number;
  status: 'waiting' | 'called' | 'completed' | 'cancelled';
  estimated_wait_minutes: number;
  created_at: string;
}

const playAlertTone = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 0.12;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.25);
    oscillator.onended = () => audioContext.close();
  } catch (error) {
    // Silently ignore audio failures en dispositivos con restricciones.
    console.warn('Audio no disponible', error);
  }
};

export function ClientTurnoContent({ initialToken }: { initialToken: string }) {
  const [token, setToken] = useState<string | null>(initialToken || null);
  const [turn, setTurn] = useState<TurnData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const previousStatus = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      setErrorMessage('No se encontró el token en la URL.');
      setLoading(false);
      return;
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const fetchTurn = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('turns')
        .select('id, customer_name, turn_number, status, estimated_wait_minutes, created_at')
        .eq('token', token)
        .single();

      if (error) {
        setErrorMessage('No se encontró el turno. El token es inválido o expiró.');
        setTurn(null);
        setLoading(false);
        return;
      }

      setTurn(data as TurnData);
      setErrorMessage(null);
      setLoading(false);
    };

    fetchTurn();

    const channel = supabase
      .channel(`turno-${token}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turns', filter: `token=eq.${token}` },
        () => {
          fetchTurn();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [token]);

  useEffect(() => {
    if (!turn) return;
    if (previousStatus.current !== turn.status && turn.status === 'called') {
      playAlertTone();
    }
    previousStatus.current = turn.status;
  }, [turn]);

  const alertStyles = useMemo(() => {
    if (!turn) return 'bg-slate-900 text-slate-200';
    if (turn.status === 'called') return 'bg-rose-600 text-white border-4 border-rose-400';
    if (turn.status === 'completed') return 'bg-emerald-600 text-white border-4 border-emerald-300';
    return 'bg-slate-900 text-slate-200';
  }, [turn]);

  const statusLabel = useMemo(() => {
    if (!turn) return 'Sin turno';
    switch (turn.status) {
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
  }, [turn]);

  return (
    <div className="min-h-screen bg-slate-950 text-white px-6 py-8">
      <div className="mx-auto flex max-w-md flex-col gap-6 rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/40">
        <div className="text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-emerald-400">Tu turno</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Verifica tu estado</h1>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-700 bg-slate-950 p-8 text-center text-lg text-slate-300">
            Cargando turno...
          </div>
        ) : errorMessage ? (
          <div className="rounded-3xl border border-rose-500 bg-rose-500/10 p-6 text-center text-base text-rose-200">
            <p className="text-xl font-semibold">Token inválido</p>
            <p className="mt-2 text-sm leading-6">{errorMessage}</p>
          </div>
        ) : turn ? (
          <div className={`space-y-6 rounded-[2rem] border ${alertStyles} p-6 transition`}>
            <div className="rounded-3xl bg-black/20 p-4 text-center">
              <p className="text-sm uppercase tracking-[0.35em] text-slate-300">Estado</p>
              <p className="mt-2 text-3xl font-semibold">{statusLabel}</p>
            </div>

            <div className="grid gap-4">
              <div className="rounded-3xl bg-slate-950/80 p-5">
                <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Nombre</p>
                <p className="mt-2 text-2xl font-semibold">{turn.customer_name}</p>
              </div>
              <div className="rounded-3xl bg-slate-950/80 p-5">
                <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Número</p>
                <p className="mt-2 text-2xl font-semibold">#{turn.turn_number}</p>
              </div>
              <div className="rounded-3xl bg-slate-950/80 p-5">
                <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Tiempo estimado</p>
                <p className="mt-2 text-2xl font-semibold">{turn.estimated_wait_minutes} min</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-3xl bg-slate-950/90 p-5 text-center text-sm text-slate-400">
          <p>La página se actualiza automáticamente en tiempo real.</p>
          <p className="mt-2">Si tu turno fue llamado, verás una alerta roja y un sonido.</p>
        </div>
      </div>
    </div>
  );
}