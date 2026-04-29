import openSocket from "socket.io-client";
import { getBackendUrl } from "../config";

let sharedSocket = null;

const getOrCreateSharedSocket = () => {
  if (sharedSocket && sharedSocket.connected) return sharedSocket;

  if (sharedSocket && !sharedSocket.connected) {
    sharedSocket.connect();
    return sharedSocket;
  }

  const token = localStorage.getItem("token");

  sharedSocket = openSocket(getBackendUrl(), {
    transports: ["websocket", "polling"],
    query: { token: JSON.parse(token) },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  sharedSocket.on("connect", () => {
    console.debug("[socket] connected:", sharedSocket.id);
  });

  sharedSocket.on("disconnect", (reason) => {
    console.debug("[socket] disconnected:", reason);
  });

  sharedSocket.on("connect_error", (err) => {
    console.warn("[socket] connection error:", err.message);
  });

  return sharedSocket;
};

/**
 * Returns a scoped proxy over the shared WebSocket.
 *
 * Components use the proxy exactly like before — including calling
 * socket.disconnect() on unmount. The proxy intercepts disconnect() and
 * removes only the listeners that THIS component registered, leaving the
 * shared connection and all other components' listeners intact.
 */
function connectToSocket() {
  const socket = getOrCreateSharedSocket();

  // Track handlers registered through this proxy instance
  const registered = new Map(); // event -> Set<handler>

  const proxy = {
    get id() { return socket.id; },
    get connected() { return socket.connected; },

    on(event, handler) {
      if (!registered.has(event)) registered.set(event, new Set());
      registered.get(event).add(handler);
      socket.on(event, handler);
      return proxy;
    },

    off(event, handler) {
      if (handler) {
        registered.get(event)?.delete(handler);
        socket.off(event, handler);
      } else {
        // Remove all handlers for this event registered by this proxy
        registered.get(event)?.forEach(h => socket.off(event, h));
        registered.delete(event);
      }
      return proxy;
    },

    emit(event, ...args) {
      socket.emit(event, ...args);
      return proxy;
    },

    // Removes only this proxy's listeners — does NOT close the connection
    disconnect() {
      registered.forEach((handlers, event) => {
        handlers.forEach(h => socket.off(event, h));
      });
      registered.clear();
    },

    // Pass-through for any other socket.io methods components may use
    removeAllListeners() {
      registered.forEach((handlers, event) => {
        handlers.forEach(h => socket.off(event, h));
      });
      registered.clear();
    }
  };

  return proxy;
}

/**
 * Fully disconnects the shared socket — call this only on user logout.
 */
export function disconnectSocket() {
  if (sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
  }
}

export default connectToSocket;
