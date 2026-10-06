import type { WsMessage } from "../types";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws/live";

export function connectLiveSocket(onMessage: (msg: WsMessage) => void): () => void {
  let socket: WebSocket | null = null;
  let closedByClient = false;
  let retryDelay = 1000;

  function open() {
    socket = new WebSocket(WS_URL);
    socket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        // ignore malformed frames
      }
    };
    socket.onclose = () => {
      if (!closedByClient) {
        setTimeout(open, retryDelay);
        retryDelay = Math.min(retryDelay * 1.5, 10000);
      }
    };
    socket.onopen = () => {
      retryDelay = 1000;
    };
  }

  open();

  return () => {
    closedByClient = true;
    socket?.close();
  };
}
