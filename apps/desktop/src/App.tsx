import React, { useEffect, useState } from 'react';

const App: React.FC = () => {
  const [platform, setPlatform] = useState<string>('loading...');

  useEffect(() => {
    let mounted = true;
    
    const checkTauri = () => {
      try {
        // @ts-ignore - Tauri will be available in the window object
        if (window.__TAURI__) {
          setPlatform('Tauri app');
        } else {
          setPlatform('browser');
        }
      } catch (error) {
        setPlatform('browser');
      }
    };
    
    checkTauri();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="app-shell">
      <header>
        <h1>Basalt Desktop</h1>
        <p>Running on {platform}</p>
      </header>
      <main>
        <section>
          <h1>Welcome to Basalt</h1>
          <p>Your Obsidian alternative powered by Tauri</p>
        </section>
      </main>
    </div>
  );
};

export default App;
