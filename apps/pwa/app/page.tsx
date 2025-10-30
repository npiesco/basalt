import React from 'react';
import Link from 'next/link';

// Note: @basalt/shared-ui needs to be properly linked in your workspace
// import { NoteTitleCard } from '@basalt/shared-ui';

export default function HomePage(): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">Basalt PWA</h1>
        <div className="bg-white p-6 rounded-lg shadow">
          <p className="text-gray-700 mb-4">
            This UI mirrors the AbsurderSQL PWA explorer reference. Open{' '}
            <Link 
              href="https://github.com/npiesco/absurder-sql" 
              className="text-blue-600 hover:text-blue-800 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              example explorer docs
            </Link>{' '}
            while developing complex flows.
          </p>
          {/* Uncomment when shared-ui is properly set up */}
          {/* <NoteTitleCard title="Welcome" /> */}
        </div>
      </div>
    </div>
  );
}
