# Printer I/O automation and hardware checklist

## Automation outcome

Connect is automated with `e2e/fake-serial.ts`: a fake `navigator.serial` port answers the handshake
(`c1` connect, `40` info types 08/09/0a/0b/0c/0d/07, `58` sound settings). Two details cost time to find:

- The serial client prefixes the first frame with `03` (`03 55 55 c1 ...`); the fake locates the `55 55` start.
- The client only starts waiting for a response after `write()` resolves, so the fake answers 20 ms later.

Not answered (the client logs a warning and continues, ~1 s each): heartbeat `dc`, RFID `1a`.
Connect takes about 5 s because of those timeouts.

Printing (the print job packets and progress) is not automated.

## Manual hardware checklist (must pass on the React entry before cutover)

Run on a real printer against both `/` (Svelte) and `/react.html` (React), compare results.

- [ ] USB (Web Serial): connect, device name and battery show in the header, disconnect.
- [ ] Bluetooth (Web Bluetooth): connect, disconnect, reconnect.
- [ ] Settings popover: HW/FW versions, RFID paper info refresh, power and connection sound switches.
- [ ] "Detailed information" dialog opens and shows data.
- [ ] Print preview: Print button enabled when connected; print one label; copies = 2 prints two.
- [ ] Print progress bar and "Cancel print" during a multi-copy job.
- [ ] Density, label type and print task selection change the output; the lock buttons persist them across reload.
- [ ] Offset (inner/outer) shifts the print as expected.
- [ ] Firmware updater dialog opens (do NOT flash).
- [ ] Heartbeat on/off from the debug section; unplug the printer, the UI shows the disconnected state.
- [ ] Font import: add a .ttf/.otf through the font menu, it appears in the font list, text renders with it, survives reload.
- [ ] ZPL import and PDF import add an image object.
- [ ] Image object: add via file picker, fit-to-page modes (stretch / fit / fill).
- [ ] Android (Capacitor) and Windows (Tauri) builds start and connect (cutover PR only).

## Svelte-app quirks found while writing the suite (decide per quirk whether React keeps them)

- ArrowUp/ArrowDown while a toolbar dropdown toggle has focus are swallowed by Bootstrap (objects do not move).
- After Load/Import the saved-labels menu is hidden programmatically and the toggle's `aria-expanded` stays `true`.
- Importing a file that is not valid JSON throws an unhandled rejection (`JSON.parse` outside the `try`); wrong-schema JSON is handled with an error toast.
