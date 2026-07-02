type CloseCallback = (error?: Error) => void;

type ClosableServer = {
  close(callback: CloseCallback): void;
};

type ClosableSocket = {
  close(code?: number, reason?: string): void;
};

type ClosableWebSocketServer = ClosableServer & {
  clients: Iterable<ClosableSocket>;
};

type TuimuxShutdownTarget = {
  shutdown(): Promise<void>;
};

type ShutdownControllerInput = {
  server: ClosableServer;
  wss: ClosableWebSocketServer;
  tuimux: TuimuxShutdownTarget;
  exit?: (code: number) => void;
};

function closeServer(target: ClosableServer): Promise<void> {
  return new Promise((resolve, reject) => {
    target.close((error?: Error & { code?: string }) => {
      if (!error || error.code === "ERR_SERVER_NOT_RUNNING") {
        resolve();
        return;
      }
      reject(error);
    });
  });
}

export function createShutdownController({ server, wss, tuimux, exit = process.exit }: ShutdownControllerInput) {
  let inFlight: Promise<void> | null = null;

  async function runShutdown(exitCode: number): Promise<void> {
    for (const client of wss.clients) {
      client.close(1001, "Tycho server shutting down");
    }
    await closeServer(wss);
    await closeServer(server);
    await tuimux.shutdown();
    exit(exitCode);
  }

  return {
    shutdown(exitCode = 0): Promise<void> {
      inFlight ??= runShutdown(exitCode);
      return inFlight;
    }
  };
}
