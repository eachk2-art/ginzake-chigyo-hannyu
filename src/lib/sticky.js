import { useEffect, useState } from 'react';

// 画面を閉じて戻ってきたときに、日付・開いていた池場などを元に戻すための入れ物（★2026-11-24）。
// ・画面（コンポーネント）が作り直されても値が残る。ブラウザを再読み込みすると消える
// ・メニュー（NavBar）で別の画面へ移るときは clearSticky() で消して、初期状態から開く
const store = new Map();

export function useSticky(key, init) {
  const [value, setValue] = useState(() => {
    if (store.has(key)) return store.get(key);
    return typeof init === 'function' ? init() : init;
  });
  useEffect(() => {
    store.set(key, value);
  }, [key, value]);
  return [value, setValue];
}

export function clearSticky() {
  store.clear();
}

/** Set の中身を1つ足す／外す（開閉の切り替え用） */
export function toggleInSet(setter, key) {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
}
