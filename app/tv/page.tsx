'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Turn {
  id: string;
  customer_name: string;
  turn_number: number;
  status: 'waiting' | 'called' | 'completed' | 'cancelled';
  created_at: string;
}

const QR_VERSION = 5;
const QR_SIZE = 21 + (QR_VERSION - 1) * 4;
const QR_FORMAT_BITS = '111011111000100';

const createGaloisFields = () => {
  const exp: number[] = new Array(512).fill(0);
  const log: number[] = new Array(256).fill(0);
  let x = 1;

  for (let i = 0; i < 255; i += 1) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }

  for (let i = 255; i < 512; i += 1) {
    exp[i] = exp[i - 255];
  }

  return { exp, log };
};

const { exp: GF_EXP, log: GF_LOG } = createGaloisFields();

const gfMul = (a: number, b: number) => {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
};

const polyMul = (p: number[], q: number[]) => {
  const result = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i += 1) {
    for (let j = 0; j < q.length; j += 1) {
      result[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return result;
};

const polyDiv = (dividend: number[], divisor: number[]) => {
  const result = dividend.slice();
  for (let i = 0; i <= dividend.length - divisor.length; i += 1) {
    const coef = result[i];
    if (coef !== 0) {
      for (let j = 0; j < divisor.length; j += 1) {
        result[i + j] ^= gfMul(divisor[j], coef);
      }
    }
  }
  return result.slice(-divisor.length + 1);
};

const createGenerator = (degree: number) => {
  let gen = [1];
  for (let i = 0; i < degree; i += 1) {
    gen = polyMul(gen, [1, GF_EXP[i]]);
  }
  return gen;
};

const encodeBytes = (text: string) => {
  const encoder = new TextEncoder();
  return Array.from(encoder.encode(text));
};

const toBits = (bytes: number[]) => bytes.flatMap((byte) => {
  const bits: number[] = [];
  for (let i = 7; i >= 0; i -= 1) {
    bits.push((byte >> i) & 1);
  }
  return bits;
});

const buildDataCodewords = (text: string) => {
  const bytes = encodeBytes(text);
  const dataBits: number[] = [];

  dataBits.push(0, 1, 0, 0);
  const lengthBits = bytes.length.toString(2).padStart(8, '0');
  lengthBits.split('').forEach((bit) => dataBits.push(Number(bit)));
  dataBits.push(...toBits(bytes));

  const totalDataBits = 108 * 8;
  const terminatorLength = Math.min(4, totalDataBits - dataBits.length);
  for (let i = 0; i < terminatorLength; i += 1) dataBits.push(0);

  while (dataBits.length % 8 !== 0) dataBits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < dataBits.length; i += 8) {
    codewords.push(parseInt(dataBits.slice(i, i + 8).join(''), 2));
  }

  const padding = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < 108) {
    codewords.push(padding[padIndex % 2]);
    padIndex += 1;
  }

  return codewords;
};

const createErrorCorrection = (dataCodewords: number[]) => {
  const ecLength = 26;
  const generator = createGenerator(ecLength);
  const message = [...dataCodewords, ...new Array(ecLength).fill(0)];
  return polyDiv(message, generator);
};

const buildQrMatrix = (text: string) => {
  const matrix: (0 | 1 | null)[][] = Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(null));

  const setModule = (x: number, y: number, value: 0 | 1) => {
    matrix[y][x] = value;
  };

  const placeFinderPattern = (x: number, y: number) => {
    const pattern = [
      [1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 1, 1, 0, 1],
      [1, 0, 1, 1, 1, 0, 1],
      [1, 0, 1, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1],
    ];
    for (let dy = 0; dy < 7; dy += 1) {
      for (let dx = 0; dx < 7; dx += 1) {
        setModule(x + dx, y + dy, pattern[dy][dx] as 0 | 1);
      }
    }
  };

  const placeAlignmentPattern = (x: number, y: number) => {
    const pattern = [
      [1, 1, 1, 1, 1],
      [1, 0, 0, 0, 1],
      [1, 0, 1, 0, 1],
      [1, 0, 0, 0, 1],
      [1, 1, 1, 1, 1],
    ];
    for (let dy = 0; dy < 5; dy += 1) {
      for (let dx = 0; dx < 5; dx += 1) {
        setModule(x + dx, y + dy, pattern[dy][dx] as 0 | 1);
      }
    }
  };

  placeFinderPattern(0, 0);
  placeFinderPattern(QR_SIZE - 7, 0);
  placeFinderPattern(0, QR_SIZE - 7);

  for (let i = 0; i < 8; i += 1) {
    setModule(7, i, 0);
    setModule(i, 7, 0);
    setModule(QR_SIZE - 8, i, 0);
    setModule(QR_SIZE - 1 - i, 7, 0);
    setModule(i, QR_SIZE - 8, 0);
    setModule(7, QR_SIZE - 1 - i, 0);
  }

  for (let i = 8; i < QR_SIZE - 8; i += 1) {
    setModule(i, 6, i % 2 === 0 ? 1 : 0);
    setModule(6, i, i % 2 === 0 ? 1 : 0);
  }

  setModule(8, QR_SIZE - 8, 1);

  const alignmentLocations = [6, QR_SIZE - 7 - 1];
  alignmentLocations.forEach((x) => {
    alignmentLocations.forEach((y) => {
      if ((x === 6 && y === 6) || (x === 6 && y === QR_SIZE - 7 - 1) || (x === QR_SIZE - 7 - 1 && y === 6)) {
        return;
      }
      placeAlignmentPattern(x - 2, y - 2);
    });
  });

  const dataCodewords = buildDataCodewords(text);
  const ecCodewords = createErrorCorrection(dataCodewords);
  const codewords = [...dataCodewords, ...ecCodewords];

  const dataBits = toBits(codewords);
  let bitIndex = 0;

  let directionUp = true;
  let x = QR_SIZE - 1;
  let y = QR_SIZE - 1;

  while (x > 0) {
    if (x === 6) x -= 1;
    for (;;) {
      for (let xi = 0; xi < 2; xi += 1) {
        const cx = x - xi;
        if (matrix[y][cx] === null && bitIndex < dataBits.length) {
          setModule(cx, y, dataBits[bitIndex] as 0 | 1);
          bitIndex += 1;
        }
      }
      y += directionUp ? -1 : 1;
      if (y < 0 || y >= QR_SIZE) {
        y += directionUp ? 1 : -1;
        directionUp = !directionUp;
        x -= 2;
        break;
      }
    }
  }

  const formatBits = QR_FORMAT_BITS.split('').map(Number) as (0 | 1)[];
  for (let i = 0; i < 15; i += 1) {
    const bit = formatBits[i] as 0 | 1;
    if (i < 8) {
      setModule(8, i === 6 ? i + 1 : i, bit);
      setModule(i === 6 ? i + 1 : i, 8, bit);
    } else {
      setModule(8, QR_SIZE - 15 + i, bit);
      setModule(QR_SIZE - 15 + i, 8, bit);
    }
  }

  return matrix.map((row) => row.map((cell) => (cell === 1 ? 1 : 0)));
};

const renderQR = (matrix: number[][]) => {
  const moduleSize = 8;
  return (
    <svg
      viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`}
      width={QR_SIZE * moduleSize}
      height={QR_SIZE * moduleSize}
      className="mx-auto block"
      role="img"
      aria-label="Código QR para acceder a turno"
    >
      <rect width={QR_SIZE} height={QR_SIZE} fill="#fff" />
      {matrix.flatMap((row, y) =>
        row.map((cell, x) =>
          cell ? (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#000" />
          ) : null
        )
      )}
    </svg>
  );
};

export default function TVPage() {
  const [currentTurn, setCurrentTurn] = useState<Turn | null>(null);
  const [nextTurns, setNextTurns] = useState<Turn[]>([]);
  const [qrUrl, setQrUrl] = useState('/turno');

  const fetchTurns = async () => {
    const { data, error } = await supabase
      .from('turns')
      .select('id, customer_name, turn_number, status, created_at')
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
    setQrUrl(`${window.location.origin}/turno`);
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

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-10">
        <header className="mb-8 text-center">
          <p className="text-base uppercase tracking-[0.35em] text-emerald-400">Pantalla pública</p>
          <h1 className="mt-4 text-6xl font-black tracking-tight lg:text-7xl">Sistema de Turnos</h1>
        </header>

        <main className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-start">
          <section className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-black/40">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Turno actual</p>
                <p className="mt-2 text-3xl font-semibold text-white">Llamando ahora</p>
              </div>
              <div className="inline-flex items-center gap-3 rounded-full bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300">
                En vivo
              </div>
            </div>

            <div className="rounded-[2rem] border border-emerald-500/20 bg-emerald-500/10 p-10 text-center">
              {currentTurn ? (
                <>
                  <p className="text-8xl font-black tracking-[0.2em] text-emerald-300">#{currentTurn.turn_number}</p>
                  <p className="mt-6 text-4xl font-semibold text-white">{currentTurn.customer_name}</p>
                </>
              ) : (
                <p className="text-6xl font-black tracking-[0.2em] text-slate-400">ESPERANDO</p>
              )}
            </div>
          </section>

          <aside className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-black/40">
            <p className="text-sm uppercase tracking-[0.4em] text-slate-400">QR para celular</p>
            <div className="mt-6 flex h-full flex-col items-center justify-center gap-4 rounded-[2rem] border border-slate-700 bg-slate-950 px-6 py-8">
              <div className="overflow-hidden rounded-3xl bg-white p-3 shadow-xl">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`} alt="QR Code" className="block" />
              </div>
              <p className="text-center text-lg font-semibold text-slate-200">Escanea para ver tu turno</p>
              <p className="text-center text-lg font-bold text-white">{qrUrl}</p>
            </div>
          </aside>
        </main>

        <section className="mt-10 rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8 shadow-2xl shadow-black/40">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Próximos turnos</p>
              <p className="mt-2 text-2xl font-semibold text-white">En espera</p>
            </div>
            <span className="rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300">
              {nextTurns.length} mostrados
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {nextTurns.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/80 p-8 text-center text-slate-500">
                No hay turnos en espera
              </div>
            ) : (
              nextTurns.map((turn) => (
                <div
                  key={turn.id}
                  className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 transition hover:border-emerald-500"
                >
                  <p className="text-5xl font-black text-white">#{turn.turn_number}</p>
                  <p className="mt-3 text-xl font-semibold text-slate-200">{turn.customer_name}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
