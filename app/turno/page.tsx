import { ClientTurnoContent } from './client-turno';

export default function TurnoPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const token = searchParams.token as string;
  return <ClientTurnoContent initialToken={token} />;
}
