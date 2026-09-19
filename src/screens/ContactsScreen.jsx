import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMasters } from '../context/MasterContext';
import { LoadingMsg } from '../components/UI';

export default function ContactsScreen() {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const [openGroup, setOpenGroup] = useState(null); // "カテゴリ|ID" の形。一度に1つだけ開く
  const canSeeAll = auth.role === '太協'; // 内水面業者・海面業者、運送業者の運行管理者・社長は太協のみ
  const canSeeCarrierDrivers = auth.role === '太協' || auth.role === '運送会社'; // 運送業者のドライバー欄は運送会社も可

  if (!masters) return <LoadingMsg>読み込んでいます…</LoadingMsg>;

  const taikyoTile = (masters.ログイン事業者 || []).find((t) => t['事業者区分'] === '太協');
  const taikyoStaff = (masters.担当者 || []).filter((t) => t['区分'] === '太協担当');

  const carriers = (masters.運送会社 || []).map((c) => {
    const cid = c['運送会社ID'];
    const vehicles = (masters.車輌 || []).filter((v) => v['運送会社ID'] === cid);
    const driverIds = new Set();
    const drivers = vehicles
      .map((v) => {
        const d = (masters.担当者 || []).find((t) => t['担当者ID'] === v['通常ドライバー担当者ID']);
        if (!d) return null;
        driverIds.add(d['担当者ID']);
        return { name: d['氏名'], contact: d['連絡先'], vehicleNo: v['車番'] };
      })
      .filter(Boolean);
    const office = (masters.担当者 || []).filter(
      (t) => t['区分'] === '運送会社担当者' && t['所属先ID'] === cid && !driverIds.has(t['担当者ID'])
    );
    return { id: cid, name: c['運送会社名'], drivers, office };
  });

  const suisanList = (masters.内水面業者 || []).map((u) => ({
    id: u['内水面業者ID'],
    name: u['内水面業者名'] || u['略称'],
    staff: (masters.担当者 || []).filter((t) => t['区分'] === '内水面業者担当者' && t['所属先ID'] === u['内水面業者ID']),
  }));

  const kaimenList = (masters.海面業者 || []).map((k) => ({
    id: k['海面業者ID'],
    name: `${k['氏名']}${k['屋号'] ? `（${k['屋号']}）` : ''}`,
    staff: (masters.担当者 || []).filter((t) => t['区分'] === '海面業者担当者' && t['所属先ID'] === k['海面業者ID']),
  }));

  function toggle(key) {
    setOpenGroup((prev) => (prev === key ? null : key));
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)', color: 'var(--c-text)', padding: '16px 16px 60px' }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: '4px 0 16px' }}>連絡先一覧</h2>

      {/* 太協物産（全ロール共通で見える） */}
      <Section title="太協物産">
        {taikyoTile?.['連絡先'] && <ContactRow name="代表番号" contact={taikyoTile['連絡先']} emphasize />}
        {taikyoStaff.map((t) => (
          <ContactRow key={t['担当者ID']} name={t['氏名']} contact={t['連絡先']} />
        ))}
        {!taikyoTile?.['連絡先'] && taikyoStaff.length === 0 && <EmptyNote />}
      </Section>

      {canSeeCarrierDrivers && (
        <GroupList
          title="運送業者"
          items={carriers.map((c) => ({
            id: c.id,
            name: c.name,
            render: (
              <>
                {canSeeAll && c.office.length > 0 && (
                  <>
                    <div style={subHeadStyle}>運行管理者・社長</div>
                    {c.office.map((t) => (
                      <ContactRow key={t['担当者ID']} name={t['氏名']} contact={t['連絡先']} />
                    ))}
                  </>
                )}
                {c.drivers.length > 0 && (
                  <>
                    <div style={subHeadStyle}>ドライバー</div>
                    {c.drivers.map((d, i) => (
                      <ContactRow key={i} name={`${d.name}（${d.vehicleNo}）`} contact={d.contact} />
                    ))}
                  </>
                )}
                {(canSeeAll ? c.office.length === 0 && c.drivers.length === 0 : c.drivers.length === 0) && (
                  <EmptyNote />
                )}
              </>
            ),
          }))}
          openGroup={openGroup}
          onToggle={toggle}
          groupKey="carrier"
        />
      )}

      {canSeeAll && (
        <>
          <GroupList
            title="内水面業者"
            items={suisanList.map((u) => ({
              id: u.id,
              name: u.name,
              render:
                u.staff.length > 0 ? (
                  u.staff.map((t) => <ContactRow key={t['担当者ID']} name={t['氏名']} contact={t['連絡先']} />)
                ) : (
                  <EmptyNote />
                ),
            }))}
            openGroup={openGroup}
            onToggle={toggle}
            groupKey="suisan"
          />

          <GroupList
            title="海面業者"
            items={kaimenList.map((k) => ({
              id: k.id,
              name: k.name,
              render:
                k.staff.length > 0 ? (
                  k.staff.map((t) => <ContactRow key={t['担当者ID']} name={t['氏名']} contact={t['連絡先']} />)
                ) : (
                  <EmptyNote />
                ),
            }))}
            openGroup={openGroup}
            onToggle={toggle}
            groupKey="kaimen"
          />
        </>
      )}
    </div>
  );
}

function GroupList({ title, items, openGroup, onToggle, groupKey }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, margin: '20px 0 8px' }}>{title}</div>
      {items.map((item) => {
        const key = `${groupKey}|${item.id}`;
        const isOpen = openGroup === key;
        return (
          <div
            key={item.id}
            style={{
              background: 'var(--c-bg-2)',
              border: '1px solid var(--c-border)',
              borderRadius: 12,
              marginBottom: 10,
              overflow: 'hidden',
            }}
          >
            <button onClick={() => onToggle(key)} style={groupHeaderStyle}>
              <span>{item.name}</span>
              <span style={{ color: 'var(--c-text-3)', fontWeight: 400, fontSize: 14 }}>{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && <div style={{ borderTop: '1px solid var(--c-border)', padding: '10px 16px 14px' }}>{item.render}</div>}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '4px 16px' }}>
        {children}
      </div>
    </div>
  );
}

function ContactRow({ name, contact, emphasize }) {
  if (!contact) return null;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: '1px solid var(--c-border)',
      }}
    >
      <span style={{ fontSize: emphasize ? 16 : 15, fontWeight: emphasize ? 700 : 400 }}>{name}</span>
      <a
        href={`tel:${contact}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--c-accent)',
          textDecoration: 'none',
          padding: '6px 4px',
        }}
      >
        <PhoneIcon size={22} />
        {contact}
      </a>
    </div>
  );
}

function EmptyNote() {
  return <div style={{ padding: '10px 0', fontSize: 14, color: 'var(--c-text-3)' }}>登録されている連絡先はありません</div>;
}

function PhoneIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
    </svg>
  );
}

const groupHeaderStyle = {
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

const subHeadStyle = { fontSize: 13, color: 'var(--c-text-3)', margin: '10px 0 6px' };
