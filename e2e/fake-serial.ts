import type { Page } from "@playwright/test";

/** Replaces navigator.serial with a port that logs every request frame to window.__serialLog and replies from a table. */
export async function installFakeSerial(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __serialLog: string[] }).__serialLog = log;

    const frame = (cmd: number, data: number[]): Uint8Array => {
      const checksum = [cmd, data.length, ...data].reduce((a, b) => a ^ b, 0);
      return Uint8Array.from([0x55, 0x55, cmd, data.length, ...data, checksum, 0xaa, 0xaa]);
    };

    // request command -> [response command, response data]; extend from __serialLog during the spike
    const RESPONSES: Record<number, (data: number[]) => [number, number[]] | undefined> = {
      0xc1: () => [0xc2, [0x02]],
      0x40: (data) => {
        const infoType = data[0];
        if (infoType === 0x08) return [0x48, [0x09, 0x00]];
        if (infoType === 0x0c) return [0x4c, [0x05, 0x1e]];
        if (infoType === 0x09) return [0x49, [0x05, 0x1e]];
        if (infoType === 0x0b) return [0x4b, [0x31, 0x32, 0x33, 0x34]]; // serial number
        if (infoType === 0x0d) return [0x4d, [0x01, 0x02, 0x03, 0x04, 0x05, 0x06]]; // bluetooth address
        if (infoType === 0x0a) return [0x4a, [0x64]]; // charge level
        if (infoType === 0x07) return [0x47, [0x00, 0x1e]]; // auto shutdown time
        return undefined;
      },
      0x58: (data) => [0x68, data], // sound settings: echo the item and value
    };

    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const readable = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        // request frame: [03] 55 55 cmd len data... chk aa aa (the serial client prefixes 03)
        const start = chunk.findIndex((b, i) => b === 0x55 && chunk[i + 1] === 0x55);
        const cmd = chunk[start + 2];
        const len = chunk[start + 3];
        const data = Array.from(chunk.slice(start + 4, start + 4 + len));
        log.push(`${cmd.toString(16)} ${data.map((b) => b.toString(16)).join(" ")}`);
        const reply = RESPONSES[cmd]?.(data);
        if (reply) {
          // the client starts waiting for a response only after write() resolves, so answer a bit later
          setTimeout(() => controller.enqueue(frame(reply[0], reply[1])), 20);
        }
      },
    });

    const port = Object.assign(new EventTarget(), {
      readable,
      writable,
      open: async () => {},
      close: async () => {},
      getInfo: () => ({ usbVendorId: 0x3513, usbProductId: 0x0002 }),
    });

    Object.defineProperty(navigator, "serial", {
      configurable: true,
      value: { requestPort: async () => port },
    });
  });
}
