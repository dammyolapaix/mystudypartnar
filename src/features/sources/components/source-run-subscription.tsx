"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { refreshSources } from "../actions";

const MAX_RECONNECT_DELAY_MS = 10_000;

export function SourceRunSubscription({
  runIds,
  children,
}: {
  runIds: string[];
  children: ReactNode;
}) {
  const router = useRouter();
  const subscriptionKey = runIds.join("\n");

  useEffect(() => {
    const ids = subscriptionKey.length === 0 ? [] : subscriptionKey.split("\n");
    if (ids.length === 0) return;

    const lastAck = new Map<string, string>();
    let socket: EventSource | null = null;
    let closed = false;
    let reconnecting = false;
    let attempts = 0;

    const connect = () => {
      if (closed) return;
      const params = new URLSearchParams();
      for (const runId of ids) {
        params.append("channel", runId);
        params.append(`last_ack_${runId}`, lastAck.get(runId) ?? "0-0");
      }

      const current = new EventSource(`/api/sources/realtime?${params}`, {
        withCredentials: true,
      });
      socket = current;

      current.onmessage = (evt) => {
        if (socket !== current) return;
        attempts = 0;
        let payload: {
          type?: string;
          event?: string;
          channel?: string;
          id?: string;
        };
        try {
          payload = JSON.parse(evt.data) as typeof payload;
        } catch {
          return;
        }

        if (payload.id && payload.channel) {
          lastAck.set(payload.channel, payload.id);
        }

        if (payload.type === "reconnect") {
          reconnecting = true;
          current.close();
          connect();
          return;
        }

        if (payload.event === "source.finished") {
          void refreshSources({}).then(() => {
            router.refresh();
          });
        }
      };

      current.onerror = () => {
        if (socket !== current || closed) return;
        if (reconnecting) {
          reconnecting = false;
          return;
        }
        current.close();
        attempts += 1;
        window.setTimeout(connect, Math.min(1000 * attempts, MAX_RECONNECT_DELAY_MS));
      };
    };

    connect();

    return () => {
      closed = true;
      socket?.close();
    };
  }, [router, subscriptionKey]);

  return children;
}
