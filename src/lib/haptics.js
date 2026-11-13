// タップしたときの軽い振動（★2026-11-13、PINのテンキー用）
// ・Android：ブラウザの振動の仕組み（navigator.vibrate）で、短く振動させる
// ・iPhone：Safariは navigator.vibrate に対応していない（呼んでも false が返るだけ）。
//   代わりに、Safari 17.4 以降の「スイッチ型チェックボックス」を見えない所に置いて切り替えると、
//   本体の触覚フィードバック（軽い手応え）が出るので、それを使う。
//   Appleの正式な機能ではないため、将来のiOSで効かなくなることがある。その場合も何も起きないだけ。
// ・本体の設定で触覚・バイブを切っていると、どちらも振動しない
// ・タップの処理の中から呼ぶこと（ブラウザは、利用者の操作の中でしか振動を許さない）

let iosLabel = null;

function iosTap() {
  try {
    if (!iosLabel) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', ''); // Safari 17.4 以降のスイッチ表示（切り替え時に触覚が出る）
      input.id = 'haptic-switch';
      const label = document.createElement('label');
      label.htmlFor = input.id;
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
      label.appendChild(input);
      document.body.appendChild(label);
      iosLabel = label;
    }
    iosLabel.click();
  } catch {
    // 効かない環境では何もしない
  }
}

/** 軽く1回振動させる */
export function hapticTap() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && navigator.vibrate(15)) {
      return; // Android など、正式な仕組みで振動できた
    }
  } catch {
    // 下の方法を試す
  }
  iosTap();
}
