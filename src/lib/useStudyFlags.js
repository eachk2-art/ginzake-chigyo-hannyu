// 到着時刻の検討の保存状況（★2026-11-27）：ホーム・積込予定一覧・納品先の画面で使う
// 戻り値：Map('日付|池場ID' → { 保存日時, 予定と違う, 到着: {搬入予定ID: "HH:mm"} })。太協・管理者以外は空
// 読めなくても画面は使えるので、エラーは出さない
import { useEffect, useState } from 'react';
import { getArrivalStudyFlags } from './api';

export function useStudyFlags(auth, from, to, enabled, reloadKey) {
  const [flags, setFlags] = useState(() => new Map());
  useEffect(() => {
    if (!enabled || !from || !to) return undefined;
    let alive = true;
    getArrivalStudyFlags(auth, from, to)
      .then((list) => {
        if (alive) setFlags(new Map((list || []).map((f) => [`${f['積込日']}|${f['池場ID']}`, f])));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [auth, from, to, enabled, reloadKey]);
  return flags;
}
