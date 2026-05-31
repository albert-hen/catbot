import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { AlphaZeroService } from '../services/AlphaZeroService';

const AlphaZeroContext = createContext<AlphaZeroService | null>(null);
const AlphaZeroReadyContext = createContext<boolean>(false);

export function AlphaZeroProvider({
  modelUrl,
  children,
}: {
  modelUrl: string;
  children: ReactNode;
}) {
  const [service] = useState(() => new AlphaZeroService());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    service.initialize(modelUrl).then(
      () => setIsReady(true),
      (err) => console.error('[AlphaZeroProvider] Failed to initialize:', err),
    );
    return () => service.terminate();
  }, []);

  return (
    <AlphaZeroContext.Provider value={service}>
      <AlphaZeroReadyContext.Provider value={isReady}>
        {children}
      </AlphaZeroReadyContext.Provider>
    </AlphaZeroContext.Provider>
  );
}

export function useAlphaZeroService(): AlphaZeroService {
  const service = useContext(AlphaZeroContext);
  if (!service) {
    throw new Error('useAlphaZeroService must be used within AlphaZeroProvider');
  }
  return service;
}

export function useAlphaZeroReady(): boolean {
  return useContext(AlphaZeroReadyContext);
}
