function findById(list, idKey, id) {
  return (list || []).find((o) => String(o[idKey]) === String(id)) || null;
}

export function ikebaName(masters, id) {
  const m = findById(masters?.池場, '池場ID', id);
  if (!m) return id || '';
  // 「地域表示」はマスタ_池場のD列（内水面業者IDと住所の間）にある。
  const region = m['地域表示'];
  return region ? `${m['池場名']}（${region}）` : m['池場名'];
}

export function suisanName(masters, id) {
  const m = findById(masters?.内水面業者, '内水面業者ID', id);
  return m ? m['略称'] || m['内水面業者名'] : id || '';
}

export function kaimenName(masters, id) {
  const m = findById(masters?.海面業者, '海面業者ID', id);
  if (!m) return id || '';
  const base = m['屋号'] ? `${m['氏名']}（${m['屋号']}）` : m['氏名'];
  return m['所在地'] ? `${base}${m['所在地']}` : base;
}

export function ikebaBaseName(masters, id) {
  const m = findById(masters?.池場, '池場ID', id);
  return m ? m['池場名'] : id || '';
}

/**
 * 出荷池の名前に、元の池（由来）を添える（★2026-11-13）。例：玉山（大沢）
 * ・schedule は積込予定1件。由来池場IDが空、または出荷池と同じなら、出荷池の名前だけを返す
 */
export function ikebaWithOrigin(masters, schedule) {
  const name = ikebaBaseName(masters, schedule?.['池場ID']);
  const origin = originIkebaName(masters, schedule);
  if (!origin) return name;
  // ★2026-11-14：「玉山（おいで）」＋元の池「大沢」→「玉山（おいで大沢）」
  const m = String(name).match(/^(.*?)\s*[（(]([^（）()]*)[）)]\s*$/);
  return m ? `${m[1]}（${m[2]}${origin}）` : `${name}（${origin}）`;
}

/**
 * 元の池（由来）の名前だけを返す。無ければ空文字。
 * ★2026-11-14：池場名の後ろの（業者名）は外し、池の名前だけにする。例：大沢（おいで）→ 大沢
 */
export function originIkebaName(masters, schedule) {
  const originId = schedule?.['由来池場ID'];
  if (!originId || originId === schedule?.['池場ID']) return '';
  return pondNameOnly(ikebaBaseName(masters, originId));
}

/** 池場名の末尾の（…）を外す。（）が無ければそのまま */
export function pondNameOnly(name) {
  const stripped = String(name || '').replace(/\s*[（(][^（）()]*[）)]\s*$/, '');
  return stripped || name || '';
}

export function ikebaRegion(masters, id) {
  const m = findById(masters?.池場, '池場ID', id);
  return m ? m['地域表示'] || '' : '';
}

export function kaimenPersonName(masters, id) {
  const m = findById(masters?.海面業者, '海面業者ID', id);
  return m ? m['氏名'] : id || '';
}

export function kaimenLocation(masters, id) {
  const m = findById(masters?.海面業者, '海面業者ID', id);
  return m ? m['所在地'] || '' : '';
}

export function vehicleLabel(masters, id) {
  if (!id) return '車輌未定'; // ★2026-11-14：車輌を決めずに登録した予定
  const v = findById(masters?.車輌, '車輌ID', id);
  return v ? v['車番'] : id;
}

/** 「22-08（フジイ）」のように車番と運送会社を並べる。車輌が未定なら「車輌未定」だけ（★2026-11-14） */
export function vehicleWithCarrier(masters, id) {
  if (!id) return '車輌未定';
  return `${vehicleLabel(masters, id)}（${carrierNameByVehicle(masters, id)}）`;
}

export function carrierNameByVehicle(masters, vehicleId) {
  const v = findById(masters?.車輌, '車輌ID', vehicleId);
  if (!v) return '';
  const c = findById(masters?.運送会社, '運送会社ID', v['運送会社ID']);
  return c ? c['略称'] || c['運送会社名'] : v['運送会社ID'] || '';
}

export function deliveryDestName(masters, id) {
  const d = findById(masters?.配送先, '配送先ID', id);
  return d ? d['配送先名'] : id || '';
}

/**
 * 立会者は「マスタ_担当者のID」でも「自由入力の氏名」でも同じ列にそのまま保存される
 * （要件定義書6章）。IDと一致すればマスタの氏名に変換し、一致しなければ
 * 入力された文字列（氏名）をそのまま表示する。
 */
export function tantoushaName(masters, idOrName) {
  if (!idOrName) return '';
  const t = findById(masters?.担当者, '担当者ID', idOrName);
  return t ? t['氏名'] : idOrName;
}

export function loginTileName(masters, id) {
  const m = findById(masters?.ログイン事業者, 'ログイン事業者ID', id);
  return m ? m['タイル表示名'] : id || '';
}
