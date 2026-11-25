import { useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MasterProvider, useMasters } from './context/MasterContext';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import ScheduleListScreen from './screens/ScheduleListScreen';
import PlanCreateScreen from './screens/PlanCreateScreen';
import PlanScreen from './screens/PlanScreen';
import RunScreen from './screens/RunScreen';
import PondLogScreen from './screens/PondLogScreen';
import PlanBulkScreen from './screens/PlanBulkScreen';
import ChangeLogScreen from './screens/ChangeLogScreen';
import KaimenPickerScreen from './screens/KaimenPickerScreen';
import KaimenScheduleScreen from './screens/KaimenScheduleScreen';
import JointScheduleScreen from './screens/JointScheduleScreen';
import KaimenMenuScreen from './screens/KaimenMenuScreen';
import ContactsScreen from './screens/ContactsScreen';
import MasterAdminScreen from './screens/MasterAdminScreen';
import FareScreen from './screens/FareScreen';
import FleetCheckScreen from './screens/FleetCheckScreen';
import HaishaScreen from './screens/HaishaScreen';
import SeasonPlanScreen from './screens/SeasonPlanScreen';
import ZentaiScreen from './screens/ZentaiScreen';
import DashboardScreen from './screens/DashboardScreen';
import EntryQrScreen from './screens/EntryQrScreen';
import LocationsScreen from './screens/LocationsScreen';
import NavBar from './components/NavBar';
import ViewSwitchBar from './components/ViewSwitchBar';
import { isAdmin, isTaikyo } from './lib/roles';
import { clearSticky } from './lib/sticky';

/**
 * 太協・内水面業者・運送会社向けの画面一式。
 * ★2026-11-24 親子方式：画面の移動は「積み重ね」（開いた画面を閉じると、1つ前の画面に戻る）。
 *   メニュー（NavBar）で選んだ画面が一番下になる。
 */
function MainShell() {
  const { auth } = useAuth();
  const { reload: reloadMasters } = useMasters();
  const [stack, setStack] = useState([{ screen: 'home' }]);
  const route = stack[stack.length - 1];
  const restoreY = useRef(null);

  // 画面が変わったら先頭へ。閉じて戻ったときは、元の位置へ戻す（読み込みを待ってから）
  useEffect(() => {
    const y = restoreY.current;
    restoreY.current = null;
    if (y === null) {
      window.scrollTo(0, 0);
      return undefined;
    }
    const t = setTimeout(() => window.scrollTo(0, y), 450);
    return () => clearTimeout(t);
  }, [stack.length, route]);

  function handleNavChange(target) {
    clearSticky();
    setStack([{ screen: target }]);
  }

  function push(r) {
    setStack((s) => {
      const copy = [...s];
      copy[copy.length - 1] = { ...copy[copy.length - 1], scrollY: window.scrollY };
      return [...copy, r];
    });
  }

  function pop() {
    setStack((s) => {
      if (s.length <= 1) return s;
      const prev = s[s.length - 2];
      restoreY.current = prev.scrollY ?? null;
      return s.slice(0, -1);
    });
  }

  function replaceTop(r) {
    setStack((s) => [...s.slice(0, -1), r]);
  }

  const taikyo = isTaikyo(auth.role);
  const admin = isAdmin(auth.role);

  const nav = {
    openPlan: (planId) => taikyo && push({ screen: 'plan', planId }),
    openRun: (runId) => taikyo && push({ screen: 'run', runId }),
    openPondLog: (date, ikebaId) => taikyo && push({ screen: 'pondLog', date, ikebaId }),
    openBulk: (date, ikebaId) => admin && push({ screen: 'bulk', date, ikebaId }),
    openCreate: (initial) => taikyo && push({ screen: 'create', initial: initial || null }),
  };

  const s = route.screen;
  return (
    <div>
      <NavBar screen={stack[0].screen} onChange={handleNavChange} />

      {s === 'home' && <HomeScreen nav={nav} />}
      {s === 'scheduleList' && <ScheduleListScreen nav={nav} />}

      {s === 'create' && taikyo && (
        <PlanCreateScreen
          initial={route.initial}
          onClose={pop}
          onDone={() => {
            reloadMasters();
            pop();
          }}
        />
      )}
      {s === 'plan' && taikyo && (
        <PlanScreen
          key={route.planId}
          planId={route.planId}
          onClose={pop}
          onOpenRun={nav.openRun}
          onOpenPondLog={nav.openPondLog}
          onReplacePlan={(planId) => replaceTop({ screen: 'plan', planId })}
        />
      )}
      {s === 'run' && taikyo && (
        <RunScreen key={route.runId} runId={route.runId} onClose={pop} onOpenPlan={nav.openPlan} onOpenPondLog={nav.openPondLog} />
      )}
      {s === 'pondLog' && taikyo && (
        <PondLogScreen key={`${route.date}|${route.ikebaId}`} date={route.date} ikebaId={route.ikebaId} onClose={pop} onOpenPlan={nav.openPlan} />
      )}
      {s === 'bulk' && admin && <PlanBulkScreen date={route.date} ikebaId={route.ikebaId} onClose={pop} />}

      {s === 'changeLog' && admin && <ChangeLogScreen />}
      {s === 'masterAdmin' && admin && <MasterAdminScreen />}
      {s === 'entryQr' && admin && <EntryQrScreen />}
      {s === 'fares' && taikyo && <FareScreen />}
      {s === 'dashboard' && taikyo && <DashboardScreen onClose={() => handleNavChange('home')} />}
      {s === 'fleetCheck' && taikyo && (
        <FleetCheckScreen onEditSchedule={(sch) => sch['搬入予定ID'] && nav.openPlan(sch['搬入予定ID'])} />
      )}
      {s === 'haisha' && taikyo && <HaishaScreen nav={nav} />}
      {s === 'seasonPlan' && taikyo && <SeasonPlanScreen />}
      {s === 'zentai' && taikyo && <ZentaiScreen nav={nav} />}
      {s === 'contacts' && (taikyo || auth.role === '運送会社') && <ContactsScreen />}
      {s === 'locations' && (taikyo || auth.role === '運送会社') && <LocationsScreen />}

      {s === 'kaimenPicker' && taikyo && (
        <KaimenPickerScreen
          onSelectKaimen={(id) => push({ screen: 'kaimenSchedule', kaimenId: id })}
          onSelectJoint={(ids) => push({ screen: 'jointScheduleAdmin', kaimenIds: ids })}
        />
      )}
      {s === 'kaimenSchedule' && taikyo && <KaimenScheduleScreen kaimenId={route.kaimenId} onClose={pop} />}
      {s === 'jointScheduleAdmin' && taikyo && <JointScheduleScreen kaimenIds={route.kaimenIds} onClose={pop} />}
    </div>
  );
}

// 海面業者向け（予定表の閲覧のみの、シンプルな画面構成）
function KaimenShell() {
  const { auth } = useAuth();
  const { masters } = useMasters();
  const [screen, setScreen] = useState('menu');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  const yokouraIds = (masters?.海面業者 || [])
    .filter((k) => (k['所在地'] || '').indexOf('横浦') >= 0)
    .map((k) => k['海面業者ID']);

  if (screen === 'schedule') {
    return <KaimenScheduleScreen kaimenId={auth.refId} onClose={() => setScreen('menu')} />;
  }
  if (screen === 'joint') {
    return <JointScheduleScreen kaimenIds={yokouraIds} onClose={() => setScreen('menu')} />;
  }
  return <KaimenMenuScreen onSelect={setScreen} />;
}

function AppInner() {
  const { auth } = useAuth();
  const lastToken = useRef(null);

  // ログインや表示切替でトークンが変わったら、日付・開閉などの覚えを消す（前の事業者の状態を引き継がない）
  if (auth && lastToken.current !== auth.token) {
    clearSticky();
    lastToken.current = auth.token;
  }

  if (!auth) return <LoginScreen />;

  // ★2026-11-13：表示切替でログインが変わったら、画面の状態ごと作り直す（key にトークンを使う）
  return (
    <MasterProvider key={auth.token}>
      <ViewSwitchBar />
      {auth.role === '海面業者' ? <KaimenShell /> : <MainShell />}
    </MasterProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
