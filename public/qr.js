// QR rendering with the vendored qrcode-generator (MIT, Kazuhiko Arase). Global `qrcode`.
export function qrSvg(text, cell = 4, margin = 2) {
  const q = globalThis.qrcode(0, 'M');
  q.addData(text, 'Byte'); q.make();
  return q.createSvgTag({ cellSize: cell, margin, scalable: false });
}
export function renderQr(el, text, cell = 4) { el.innerHTML = qrSvg(text, cell); }
