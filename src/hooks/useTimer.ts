// Timer tick — mount this once in TimerScreen to drive all active session counters
import { useEffect } from 'react';
import { useStore } from '../store/useStore';

export function useTimer(): void {
  const tickTimer = useStore(s => s.tickTimer);
  const hasActiveSessions = useStore(s => s.activeSessions.length > 0);

  useEffect(() => {
    if (!hasActiveSessions) return;

    const interval = setInterval(tickTimer, 500);

    // Page Visibility API — rattraper le temps perdu quand l'onglet redevient actif
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        tickTimer();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [hasActiveSessions, tickTimer]);
}
