// QRコードをSVGとして作る（外部サービスに接続せず、アプリの中だけで生成する）
import qrcode from './vendor/qrcode.mjs';

/**
 * 文字列からQRコードのSVGを作って返す。
 * @param {string} text 埋め込む文字列（URLなど）
 * @param {number} size 1マスの大きさ（px）
 * @param {number} margin 余白のマス数（QRの規格では4マス以上）
 */
export function qrSvg(text, size = 4, margin = 4) {
  const qr = qrcode(0, 'M'); // 型番自動・誤り訂正レベルM
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const total = (count + margin * 2) * size;

  let path = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!qr.isDark(r, c)) continue;
      const x = (c + margin) * size;
      const y = (r + margin) * size;
      path += `M${x},${y}h${size}v${size}h-${size}z`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" viewBox="0 0 ${total} ${total}">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/>` +
    `<path d="${path}" fill="#000000"/>` +
    `</svg>`
  );
}
