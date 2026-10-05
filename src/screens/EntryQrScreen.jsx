import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { isAdmin } from '../lib/roles';
import { qrSvg } from '../lib/qr';
import { printWithTitle } from '../lib/dateUtils';
import BusyButton from '../components/BusyButton';
import { EmptyMsg } from '../components/UI';

// 配布カードに刷る案内文
const NOTICE =
  'このアプリはギンザケ稚魚の運送・搬入の情報共有のためのものです。開発段階のため不十分な点があります。' +
  'あくまでも参考資料として利用してください。最終的な確認は、これまでどおり担当者からの電話連絡と、予定表のFAX送信で行います。';

const APP_URL = 'https://eachk2-art.github.io/ginzake-chigyo-hannyu/';

function entryUrl(key) {
  return `${APP_URL}?e=${key}`;
}

/** 会社は「御中」、個人名は「様」 */
function honorific(name) {
  return /(株式会社|有限会社|合同会社|養魚場|運輸|産業|漁業|物産|水産|運送)/.test(name) ? '御中' : '様';
}

export default function EntryQrScreen() {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const [counts, setCounts] = useState({}); // ログイン事業者ID → 印刷する枚数
  const [zoom, setZoom] = useState(null); // その場で見せる用の拡大表示

  const accounts = useMemo(
    () =>
      (masters?.ログイン事業者 || [])
        .filter((a) => a['入口キー'])
        .map((a) => ({
          loginId: a['ログイン事業者ID'],
          tileName: a['タイル表示名'],
          role: a['事業者区分'],
          refId: a['参照先ID'],
          key: a['入口キー'],
        })),
    [masters]
  );

  // 配布カードに刷る正式名称は、参照先のマスタから引く
  function formalName(a) {
    if (a.role === '海面業者') {
      const k = (masters?.海面業者 || []).find((x) => x['海面業者ID'] === a.refId);
      return k ? `${k['氏名']}${k['屋号'] ? `（${k['屋号']}）` : ''}` : a.tileName;
    }
    if (a.role === '運送会社') {
      const c = (masters?.運送会社 || []).find((x) => x['運送会社ID'] === a.refId);
      return c ? c['運送会社名'] : a.tileName;
    }
    if (a.role === '内水面業者') {
      const n = (masters?.内水面業者 || []).find((x) => x['内水面業者ID'] === a.refId);
      return n ? n['内水面業者名'] : a.tileName;
    }
    return a.tileName;
  }

  // 印刷するカード（枚数ぶん並べる）
  const cards = useMemo(() => {
    const list = [];
    accounts.forEach((a) => {
      const n = Number(counts[a.loginId]) || 0;
      for (let i = 0; i < n; i++) list.push(a);
    });
    return list;
  }, [accounts, counts]);

  if (!isAdmin(auth.role)) return null;

  if (zoom) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{formalName(zoom)}</div>
        <div style={{ fontSize: 14, color: 'var(--c-text-3)', marginBottom: 14 }}>{entryUrl(zoom.key)}</div>
        <div
          style={{ display: 'inline-block', background: '#fff', padding: 12, borderRadius: 12 }}
          dangerouslySetInnerHTML={{ __html: qrSvg(entryUrl(zoom.key), 7) }}
        />
        <div style={{ marginTop: 18 }}>
          <BusyButton variant="ghost" onClick={() => setZoom(null)}>
            閉じる
          </BusyButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '18px 16px 60px', maxWidth: 900, margin: '0 auto' }}>
      <div className="no-print">
        <h2 style={{ fontSize: 20, margin: '4px 0 2px' }}>入口QR・配布カード</h2>
        <div style={{ fontSize: 13, color: 'var(--c-text-3)', marginBottom: 14, lineHeight: 1.8 }}>
          事業者ごとの入口URLとQRコードです。「QRを表示」はその場で読み取ってもらう用、
          枚数を入れて「カードを印刷」するとA4縦1枚に4枚ぶん並びます（切り離して配れます）。
          <br />
          PINは印刷しません。カードのPIN欄に手書きで記入してください。
        </div>

        {accounts.length === 0 && <EmptyMsg>入口キーが設定された事業者がありません</EmptyMsg>}

        {accounts.map((a) => (
          <div
            key={a.loginId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              background: 'var(--c-bg-2)',
              border: '1px solid var(--c-border)',
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 8,
            }}
          >
            <div style={{ minWidth: 200 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{formalName(a)}</div>
              <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                {a.role}　{entryUrl(a.key)}
              </div>
            </div>
            <span style={{ flex: 1 }} />
            <label style={{ fontSize: 13, color: 'var(--c-text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              枚数
              <input
                type="number"
                min="0"
                max="20"
                value={counts[a.loginId] ?? ''}
                onChange={(e) => setCounts((c) => ({ ...c, [a.loginId]: e.target.value }))}
                style={{
                  width: 70,
                  minHeight: 42,
                  padding: '6px 8px',
                  fontSize: 15,
                  background: 'var(--c-bg)',
                  color: 'var(--c-text)',
                  border: '1px solid var(--c-border-2)',
                  borderRadius: 8,
                }}
              />
            </label>
            <BusyButton variant="ghost" onClick={() => setZoom(a)}>
              QRを表示
            </BusyButton>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <BusyButton
            onClick={() => printWithTitle('稚魚搬入管理_入口カード')}
            disabled={cards.length === 0}
          >
            カードを印刷（{cards.length}枚）
          </BusyButton>
          <BusyButton variant="ghost" onClick={() => setCounts({})}>
            枚数をクリア
          </BusyButton>
        </div>
      </div>

      {/* 印刷範囲：A4縦を4分割したカード */}
      <div className="print-area">
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {cards.map((a, i) => (
            <div
              key={`${a.loginId}-${i}`}
              style={{
                width: '50%',
                height: '48mm',
                boxSizing: 'border-box',
                border: '1px dashed #999',
                padding: '6mm 6mm',
                display: 'flex',
                gap: '5mm',
                pageBreakInside: 'avoid',
                background: '#fff',
                color: '#000',
              }}
            >
              <div dangerouslySetInnerHTML={{ __html: qrSvg(entryUrl(a.key), 3) }} />
              <div style={{ flex: 1, fontSize: '9pt', lineHeight: 1.5 }}>
                <div style={{ fontSize: '12pt', fontWeight: 700 }}>
                  {formalName(a)} {honorific(formalName(a))}
                </div>
                <div style={{ marginTop: '2mm' }}>ギンザケ稚魚 搬入管理アプリ</div>
                <div style={{ fontSize: '8pt', wordBreak: 'break-all', marginTop: '1mm' }}>{entryUrl(a.key)}</div>
                <div style={{ marginTop: '2mm' }}>PIN：＿＿＿＿＿＿</div>
                <div style={{ fontSize: '7pt', marginTop: '2mm', lineHeight: 1.4 }}>{NOTICE}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
