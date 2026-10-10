import { useCallback, useEffect, useRef, useState } from 'react';
import type * as c from '@campsite/contracts';
import { api } from './api';

/** Loads the viewer's semantic state for a Vista and commits changes (debounced, idempotent, optimistic). */
export function useVistaState(vistaId: string | null) {
  const [initial, setInitial] = useState<c.SemanticState | null>(null);
  const revision = useRef(0);
  const pending = useRef<Record<string, c.SemanticState[string]>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<c.SemanticState>({});
  useEffect(() => {
    setInitial(null); revision.current = 0; pending.current = {}; latest.current = {};
    if (!vistaId) return;
    let alive = true;
    api.state(vistaId).then(s => { if (!alive) return; revision.current = s.stateRevision; latest.current = s.state; setInitial(s.state); }).catch(() => { if (alive) setInitial({}); });
    return () => { alive = false; if (timer.current) clearTimeout(timer.current); };
  }, [vistaId]);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const flush = useCallback(() => {
    if (!vistaId) return Promise.resolve();
    // Serialize commits so each one builds on the latest known revision; on conflict adopt the server revision and retry once.
    const run = async () => {
      const entries = Object.entries(pending.current);
      pending.current = {};
      if (!entries.length) return;
      const patch = entries.map(([k, v]) => ({ op: 'replace' as const, path: `/${k}`, value: v }));
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await api.commitState(vistaId, { baseStateRevision: revision.current, idempotencyKey: `web-${vistaId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, patch });
          revision.current = r.stateRevision; latest.current = r.state;
          if (r.status === 'persisted') return;
        } catch { return; }
      }
    };
    chain.current = chain.current.then(run, run);
    return chain.current;
  }, [vistaId]);
  const onState = useCallback((state: c.SemanticState) => {
    Object.assign(pending.current, state); latest.current = { ...latest.current, ...state };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
  }, [flush]);
  return { initial, onState, current: () => latest.current, flush };
}
