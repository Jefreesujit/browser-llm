import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import type { WorkerRequest, WorkerResponse } from "../types";

type UseModelWorkerParams = {
  enabled: boolean;
  onMessage: (event: MessageEvent<WorkerResponse>) => void;
};

export const useModelWorker = ({
  enabled,
  onMessage,
}: UseModelWorkerParams) => {
  const workerRef = useRef<Worker | null>(null);
  const [workerReady, setWorkerReady] = useState(false);
  const handleMessage = useEffectEvent(
    (event: MessageEvent<WorkerResponse>) => {
      onMessage(event);
    },
  );
  const postWorkerMessage = useCallback((message: WorkerRequest) => {
    workerRef.current?.postMessage(message);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const worker = new Worker(new URL("../model.worker.ts", import.meta.url), {
      type: "module",
    });
    const listener = (event: MessageEvent<WorkerResponse>) => {
      handleMessage(event);
    };

    worker.addEventListener("message", listener);
    workerRef.current = worker;
    setWorkerReady(true);

    return () => {
      worker.removeEventListener("message", listener);
      worker.terminate();
      workerRef.current = null;
      setWorkerReady(false);
    };
  }, [enabled]);
  return {
    workerReady,
    postWorkerMessage,
  };
};
