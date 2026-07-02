import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createShutdownController } from "./shutdown.js";

type Callback = (error?: Error) => void;

function createDeferredClose(): { calls: number; close: (callback: Callback) => void; resolve: () => void } {
  let callback: Callback | null = null;
  let resolved = false;
  return {
    calls: 0,
    close(nextCallback: Callback): void {
      this.calls += 1;
      callback = nextCallback;
      if (resolved) {
        callback();
      }
    },
    resolve(): void {
      resolved = true;
      callback?.();
    }
  };
}

describe("server shutdown", () => {
  test("closes websocket clients, servers, and tuimux before exiting", async () => {
    const serverClose = createDeferredClose();
    const wssClose = createDeferredClose();
    const closedClients: Array<{ code?: number; reason?: string }> = [];
    let tuimuxShutdowns = 0;
    let exitCode: number | null = null;

    const shutdown = createShutdownController({
      server: { close: serverClose.close.bind(serverClose) },
      wss: {
        clients: [
          { close: (code?: number, reason?: string) => closedClients.push({ code, reason }) },
          { close: (code?: number, reason?: string) => closedClients.push({ code, reason }) }
        ],
        close: wssClose.close.bind(wssClose)
      },
      tuimux: {
        async shutdown(): Promise<void> {
          tuimuxShutdowns += 1;
        }
      },
      exit(code: number): void {
        exitCode = code;
      }
    });

    const done = shutdown.shutdown(0);
    wssClose.resolve();
    serverClose.resolve();
    await done;

    assert.deepEqual(closedClients, [
      { code: 1001, reason: "Tycho server shutting down" },
      { code: 1001, reason: "Tycho server shutting down" }
    ]);
    assert.equal(wssClose.calls, 1);
    assert.equal(serverClose.calls, 1);
    assert.equal(tuimuxShutdowns, 1);
    assert.equal(exitCode, 0);
  });

  test("runs shutdown cleanup once for duplicate calls", async () => {
    const serverClose = createDeferredClose();
    const wssClose = createDeferredClose();
    let tuimuxShutdowns = 0;
    let exits = 0;

    const shutdown = createShutdownController({
      server: { close: serverClose.close.bind(serverClose) },
      wss: { clients: [], close: wssClose.close.bind(wssClose) },
      tuimux: {
        async shutdown(): Promise<void> {
          tuimuxShutdowns += 1;
        }
      },
      exit(): void {
        exits += 1;
      }
    });

    const first = shutdown.shutdown(0);
    const second = shutdown.shutdown(0);
    wssClose.resolve();
    serverClose.resolve();
    await Promise.all([first, second]);

    assert.equal(wssClose.calls, 1);
    assert.equal(serverClose.calls, 1);
    assert.equal(tuimuxShutdowns, 1);
    assert.equal(exits, 1);
  });
});
