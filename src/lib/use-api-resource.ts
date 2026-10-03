"use client";

import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/hrm-api";

export function useApiResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  enabled = true,
) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string;
    loader: typeof loader;
    version: number;
  }>({ data: null, loading: true, error: "", loader, version: 0 });
  const reload = useCallback(() => setVersion((previous) => previous + 1), []);
  const replace = useCallback(
    (data: T) => setState({ data, loading: false, error: "", loader, version }),
    [loader, version],
  );
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState({ data: null, loading: true, error: "", loader, version });
      loader(controller.signal)
        .then((data) => {
          if (!controller.signal.aborted)
            setState({ data, loading: false, error: "", loader, version });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setState({
              data: null,
              loading: false,
              error: getErrorMessage(error),
              loader,
              version,
            });
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [loader, enabled, version]);
  // Do not expose a previous query or drawer's data while its new request starts.
  const current =
    enabled && state.loader === loader && state.version === version;
  return {
    data: current ? state.data : null,
    loading: enabled && (!current || state.loading),
    error: current ? state.error : "",
    reload,
    replace,
  };
}
