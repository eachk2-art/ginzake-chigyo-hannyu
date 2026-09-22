import { useState } from 'react';
import { useMasters } from '../context/MasterContext';
import { LoadingMsg } from '../components/UI';

export default function LocationsScreen() {
  const { masters } = useMasters();
  const [openGroup, setOpenGroup] = useState(null);

  if (!masters) return <LoadingMsg>読み込んでいます…</LoadingMsg>;

  function suisanName(id) {
    const u = (masters.内水面業者 || []).find((x) => x['内水面業者ID'] === id);
    return u ? u['略称'] || u['内水面業者名'] : '';
  }
  function kaimenNameOf(id) {
    const k = (masters.海面業者 || []).find((x) => x['海面業者ID'] === id);
    return k ? `${k['氏名']}${k['屋号'] ? `（${k['屋号']}）` : ''}` : '';
  }

  const ikebaList = masters.池場 || [];
  const haisosakiList = masters.配送先 || [];

  function mapLinkHref(value, label) {
    if (!value) return null;
    const v = String(value).trim();
    if (!v) return null;
    // すでにURL（共有リンク）ならそのまま使う（ラベルは変更できない）
    if (/^https?:\/\//i.test(v)) return v;
    // 住所・プラスコード等の文字列は、こちらの名称を先頭に添えて検索クエリにする
    // （Googleマップ側の判断にはなるが、名称がそのまま表示されやすくなる）
    const query = label ? `${label} ${v}` : v;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  function toggle(key) {
    setOpenGroup((prev) => (prev === key ? null : key));
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '16px 16px 60px' }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: '4px 0 16px' }}>池場・搬入先情報</h2>

      <div style={{ fontSize: 16, fontWeight: 700, margin: '4px 0 8px' }}>池場情報</div>
      {ikebaList.length === 0 && <EmptyNote />}
      {ikebaList.map((p) => (
        <PlaceCard
          key={p['池場ID']}
          groupKey={`ikeba|${p['池場ID']}`}
          isOpen={openGroup === `ikeba|${p['池場ID']}`}
          onToggle={toggle}
          title={p['池場名']}
          subtitle={suisanName(p['内水面業者ID'])}
          address={p['住所']}
          preciseHref={mapLinkHref(p['地図リンク'], p['池場名'])}
        />
      ))}

      <div style={{ fontSize: 16, fontWeight: 700, margin: '20px 0 8px' }}>海面搬入箇所情報</div>
      {haisosakiList.length === 0 && <EmptyNote />}
      {haisosakiList.map((d) => (
        <PlaceCard
          key={d['配送先ID']}
          groupKey={`haisosaki|${d['配送先ID']}`}
          isOpen={openGroup === `haisosaki|${d['配送先ID']}`}
          onToggle={toggle}
          title={kaimenNameOf(d['海面業者ID'])}
          subtitle={d['配送先名']}
          searchLabel={d['配送先名']}
          address={d['住所']}
          preciseHref={mapLinkHref(d['地図リンク'], d['配送先名'])}
        />
      ))}
    </div>
  );
}

function PlaceCard({ groupKey, isOpen, onToggle, title, subtitle, address, preciseHref, searchLabel }) {
  const roughHref = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${searchLabel || title} ${address}`)}`
    : null;

  return (
    <div
      style={{
        background: 'var(--c-bg-2)',
        border: '1px solid var(--c-border)',
        borderRadius: 12,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      <button onClick={() => onToggle(groupKey)} style={headerStyle}>
        <span>
          {title}
          {subtitle && <span style={{ color: 'var(--c-text-3)', fontWeight: 400, fontSize: 14 }}>　{subtitle}</span>}
        </span>
        <span style={{ color: 'var(--c-text-3)', fontWeight: 400, fontSize: 14 }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div style={{ borderTop: '1px solid var(--c-border)', padding: '12px 16px' }}>
            {address && <div style={{ fontSize: 14, color: 'var(--c-text-2)', marginBottom: 10 }}>{address}</div>}

            {preciseHref && <MapLink href={preciseHref} label="正確な地図を開く" primary />}
            {roughHref && (
              <div style={{ marginTop: preciseHref ? 8 : 0 }}>
                <MapLink href={roughHref} label={preciseHref ? 'おおよその地図を開く' : '地図を開く'} />
              </div>
            )}
            {!address && !preciseHref && <EmptyNote text="住所・地図リンクが登録されていません" />}
        </div>
      )}
    </div>
  );
}

function MapLink({ href, label, primary }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        color: primary ? 'var(--c-accent)' : 'var(--c-text-2)',
        textDecoration: 'none',
        fontSize: 15,
        fontWeight: primary ? 700 : 600,
      }}
    >
      <MapPinIcon size={primary ? 26 : 20} />
      {label}
    </a>
  );
}

function EmptyNote({ text = '登録されている情報はありません' }) {
  return <div style={{ padding: '10px 0', fontSize: 14, color: 'var(--c-text-3)' }}>{text}</div>;
}

function MapPinIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 2C7.86 2 4.5 5.36 4.5 9.5c0 5.25 6.32 11.53 6.59 11.8a1.3 1.3 0 0 0 1.82 0c.27-.27 6.59-6.55 6.59-11.8C19.5 5.36 16.14 2 12 2zm0 10.25a2.75 2.75 0 1 1 0-5.5 2.75 2.75 0 0 1 0 5.5z" />
    </svg>
  );
}

const headerStyle = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '14px 16px',
  background: 'transparent',
  border: 'none',
  color: 'var(--c-text)',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  minHeight: 42,
  textAlign: 'left',
};
