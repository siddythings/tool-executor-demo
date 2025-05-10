type ToolArgs = Record<string, unknown>;
import { v4 as uuidv4 } from "uuid";

export type ToolExecutorCallbacks = {
  onToolsReceived?: (serverId: string, tools: any) => void;
};

// Use browser's native WebSocket
const connectionsRef = new Map<string, WebSocket>();
const RECONNECT_DELAY = 5000; // 5 seconds
const CONNECTION_TIMEOUT = 10000; // 10 seconds
const PING_TIMEOUT = 5000; // 5 seconds
const CLOSE_NORMAL = 1000 as number;
const CLOSE_ABNORMAL = 1006 as number;

const cleanupServer = (serverId: string) => {
  const ws = connectionsRef.get(serverId);
  if (ws) {
    ws.close();
    connectionsRef.delete(serverId);
  }
};

export const pingServer = (serverId: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const ws = connectionsRef.get(serverId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      resolve(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      ws.removeEventListener("message", messageHandler);
      resolve(false);
    }, PING_TIMEOUT);

    const messageHandler = (event: MessageEvent) => {
      try {
        const response = JSON.parse(event.data);
        if (response.id === "ping") {
          clearTimeout(timeoutId);
          ws.removeEventListener("message", messageHandler);
          resolve(true);
        }
      } catch (error) {
        console.error("Error parsing ping response:", error);
      }
    };

    ws.addEventListener("message", messageHandler);
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        method: "ping",
        id: "ping",
      })
    );
  });
};

const scheduleReconnect = (
  serverId: string,
  uri: string,
  delay = RECONNECT_DELAY
) => {
  setTimeout(() => {
    console.log(`Attempting to reconnect to ${serverId}...`);
    connectToServer(serverId, uri);
  }, delay);
};

export const connectToServer = (
  serverId: string,
  url: string,
  callbacks?: ToolExecutorCallbacks
): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      console.log(`Connecting to ${serverId} at ${url}...`);
      cleanupServer(serverId); // Cleanup any existing connection

      const ws = new WebSocket(url);
      const isIntentionalClose = false;

      const connectionTimeout = setTimeout(() => {
        ws.close();
        reject(new Error("Connection timeout"));
      }, CONNECTION_TIMEOUT);

      ws.onopen = () => {
        console.log(`Connected to ${url} as ${serverId}`);
        clearTimeout(connectionTimeout);
        connectionsRef.set(serverId, ws);

        // Send initialization message
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "initialize",
            params: {
              protocolVersion: "0.1.0",
              clientInfo: { name: "ws-client", version: "1.0.0" },
              capabilities: { tools: {} },
            },
            id: 1,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);

          if (response.id === 1) {
            // Send initialized notification
            ws.send(
              JSON.stringify({
                jsonrpc: "2.0",
                method: "notifications/initialized",
              })
            );

            // Request available tools
            ws.send(
              JSON.stringify({
                jsonrpc: "2.0",
                method: "tools/list",
                id: 2,
              })
            );
          } else if (response.id === 2) {
            if (response.error) {
              console.error("Error getting tools list:", response.error);
            } else {
              console.log("Available tools:", response.result);
              // Store the tools in Redux
              if (callbacks?.onToolsReceived) {
                callbacks.onToolsReceived(
                  serverId,
                  response.result.tools || []
                );
              }
            }
            resolve();
          }
        } catch (error) {
          console.error("Error parsing message:", error);
        }
      };

      ws.onclose = (event) => {
        console.log(`Connection to ${serverId} closed with code ${event.code}`);
        clearTimeout(connectionTimeout);
        cleanupServer(serverId);

        // Only reconnect if:
        // 1. It wasn't an intentional close
        // 2. The close wasn't clean (code !== 1000)
        // 3. It was an abnormal closure (code === 1006)
        if (
          !isIntentionalClose &&
          (event.code !== CLOSE_NORMAL || event.code === CLOSE_ABNORMAL)
        ) {
          console.log(
            `Scheduling reconnect due to abnormal closure (code ${event.code})`
          );
          scheduleReconnect(serverId, url);
        }
      };

      ws.onerror = (err) => {
        console.error(`Error with ${serverId}:`, err);
        clearTimeout(connectionTimeout);
        cleanupServer(serverId);
        reject(err);
      };
    } catch (error) {
      console.error(`Failed to connect to server ${serverId}:`, error);
      reject(error);
    }
  });
};

export const toolExecutor = {
  executeTool: async (
    serverId: string,
    toolName: string,
    args: ToolArgs
  ): Promise<string> => {
    const ws = connectionsRef.get(serverId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Server not connected");
    }

    return new Promise((resolve, reject) => {
      const requestId = uuidv4();

      const messageHandler = (event: MessageEvent) => {
        try {
          const response = JSON.parse(event.data);

          if (response.id === requestId) {
            ws.removeEventListener("message", messageHandler);
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(JSON.stringify(response.result));
            }
          }
        } catch (error) {
          console.error("Error parsing tool response:", error);
          reject(new Error("Failed to parse tool response"));
        }
      };

      ws.addEventListener("message", messageHandler);

      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: toolName, arguments: args },
          id: requestId,
        })
      );
    });
  },
}; 