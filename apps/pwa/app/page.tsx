import Link from 'next/link';
import { NoteTitleCard } from '@basalt/shared-ui/src/NoteTitleCard.jsx';

export default function HomePage() {
  return (
    <main>
      <h1>Basalt PWA</h1>
      <p>
        This UI mirrors the AbsurderSQL PWA explorer reference. Open{' '}
        <Link href="https://github.com/npiesco/absurder-sql">example explorer docs</Link> while
        developing complex flows.
      </p>
      <NoteTitleCard title="Welcome to Basalt" />
    </main>
  );
}
