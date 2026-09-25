import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MasterProvider, useMasters } from './context/MasterContext';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import ScheduleListScreen from './screens/ScheduleListScreen';
import ScheduleFormScreen from './screens/ScheduleFormScreen';
import LoadingResultFormScreen from './screens/LoadingResultFormScreen';
import DeliveryResultFormScreen from './screens/DeliveryResultFormScreen';
import EditMenuScreen from './screens/EditMenuScreen';
import BulkActionsScreen from './screens/BulkActionsScreen';
import ChangeLogScreen from './screens/ChangeLogScreen';
import KaimenPickerScreen from './screens/KaimenPickerScreen';
import KaimenScheduleScreen from './screens/KaimenScheduleScreen';
import JointScheduleScreen from './screens/JointScheduleScreen';
import KaimenMenuScreen from './screens/KaimenMenuScreen';
import ContactsScreen from './screens/ContactsScreen';
import MasterAdminScreen from './screens/MasterAdminScreen';
import FareScreen from './screens/FareScreen';
import FleetCheckScreen from './screens/FleetCheckScreen';
import LocationsScreen from './screens/LocationsScreen';
import NavBar from './components/NavBar';
import { isAdmin, isTaikyo } from './lib/roles';

// 太協・内水面業者・運送会社向け（従来通りの操作画面一式）
function MainShell() {
  const { auth } = useAuth();
  const { reload: reloadMasters } = useMasters();
  const [screen, setScreen] = useState('home');

  // 画面が切り替わるたびに、前の画面のスクロール位置を引き継がないよう先頭に戻す。
  // Stateで画面を切り替えている構成（ルーティングライブラリ不使用）だと、
  // ブラウザは「ページ遷移」と認識しないため自動ではリセットされない。
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  const [editingSchedule, setEditingSchedule] = useState(null); // ScheduleFormScreenへ渡す対象（nullなら新規登録）
  const [activeSchedule, setActiveSchedule] = useState(null); // 編集メニュー配下（積込実績・搬入実績・一括入力）の対象
  const [returnScreen, setReturnScreen] = useState('home'); // 編集メニューを閉じたときに戻る先（home / scheduleList）
  const [returnFocus, setReturnFocus] = useState(null); // 戻ったときに自動で開いておく池場・業者・日付
  const [formReturnScreen, setFormReturnScreen] = useState('scheduleList'); // 予定編集画面を閉じたときに戻る先
  const [pickedKaimenId, setPickedKaimenId] = useState(null); // 太協が予定表を見る対象の海面業者ID
  const [pickedJointIds, setPickedJointIds] = useState(null); // 太協が見る共同予定表の対象ID一覧

  // NavBarのタブ切替では、別の場所を見に行く操作なのでフォーカス情報はクリアする
  function handleNavChange(target) {
    setReturnFocus(null);
    setScreen(target);
  }

  // 新規登録：積込予定一覧の「＋新規登録」からのみ入る。閉じたら一覧に戻る。
  function openCreateForm() {
    if (!isTaikyo(auth.role)) return;
    setEditingSchedule(null);
    setFormReturnScreen('scheduleList');
    setScreen('scheduleForm');
  }

  // 車輌をタップ→編集メニューを開く。fromは呼び出し元の画面（'home' | 'scheduleList'）。
  // 編集メニューを閉じると、この画面の、この車輌が含まれる業者グループを開いた状態で戻る。
  function openEditMenu(schedule, from) {
    if (!isTaikyo(auth.role)) return;
    setActiveSchedule(schedule);
    setReturnScreen(from);
    setReturnFocus({ date: schedule['積込日'], ikebaId: schedule['池場ID'], kaimenId: schedule['海面業者ID'] });
    setScreen('editMenu');
  }

  // 編集メニューの4つのボタン
  function selectMenuAction(target) {
    if (target === 'scheduleForm') {
      if (!isAdmin(auth.role)) return; // 予定の編集は管理者のみ
      setEditingSchedule(activeSchedule);
      setFormReturnScreen('editMenu');
    }
    setScreen(target);
  }

  function closeScheduleForm() {
    reloadMasters();
    setScreen(formReturnScreen);
  }

  function closeToEditMenu() {
    setScreen('editMenu');
  }

  function closeEditMenu() {
    setScreen(returnScreen);
  }

  return (
    <div>
      <NavBar screen={screen} onChange={handleNavChange} />

      {screen === 'home' && (
        <HomeScreen onEditSchedule={(s) => openEditMenu(s, 'home')} initialFocus={returnScreen === 'home' ? returnFocus : null} />
      )}

      {screen === 'scheduleList' && (
        <ScheduleListScreen
          onCreateNew={openCreateForm}
          onEditSchedule={(s) => openEditMenu(s, 'scheduleList')}
          initialFocus={returnScreen === 'scheduleList' ? returnFocus : null}
        />
      )}

      {/* 新規登録は太協も可、編集は管理者のみ（★2026-09-23） */}
      {screen === 'scheduleForm' && (editingSchedule ? isAdmin(auth.role) : isTaikyo(auth.role)) && (
        <ScheduleFormScreen
          initial={editingSchedule}
          onSaved={closeScheduleForm}
          onCancelEdit={closeScheduleForm}
          onOpenLoadingResult={() => setScreen('loadingResultForm')}
        />
      )}

      {screen === 'editMenu' && isTaikyo(auth.role) && activeSchedule && (
        <EditMenuScreen schedule={activeSchedule} onSelect={selectMenuAction} onClose={closeEditMenu} />
      )}

      {screen === 'loadingResultForm' && isTaikyo(auth.role) && activeSchedule && (
        <LoadingResultFormScreen
          schedule={activeSchedule}
          onClose={closeToEditMenu}
          onOpenDeliveryResult={() => setScreen('deliveryResultForm')}
        />
      )}

      {screen === 'deliveryResultForm' && isTaikyo(auth.role) && activeSchedule && (
        <DeliveryResultFormScreen schedule={activeSchedule} onSaved={closeToEditMenu} onClose={closeToEditMenu} />
      )}

      {screen === 'bulkActions' && isTaikyo(auth.role) && activeSchedule && (
        <BulkActionsScreen schedule={activeSchedule} onClose={closeToEditMenu} />
      )}

      {screen === 'changeLog' && isAdmin(auth.role) && <ChangeLogScreen />}

      {screen === 'masterAdmin' && isAdmin(auth.role) && <MasterAdminScreen />}

      {screen === 'fares' && isTaikyo(auth.role) && <FareScreen />}

      {screen === 'fleetCheck' && isTaikyo(auth.role) && (
        <FleetCheckScreen onEditSchedule={(s) => openEditMenu(s, 'fleetCheck')} />
      )}

      {screen === 'contacts' && (isTaikyo(auth.role) || auth.role === '運送会社') && <ContactsScreen />}

      {screen === 'locations' && (isTaikyo(auth.role) || auth.role === '運送会社') && <LocationsScreen />}

      {screen === 'kaimenPicker' && isTaikyo(auth.role) && (
        <KaimenPickerScreen
          onSelectKaimen={(id) => {
            setPickedKaimenId(id);
            setScreen('kaimenSchedule');
          }}
          onSelectJoint={(ids) => {
            setPickedJointIds(ids);
            setScreen('jointScheduleAdmin');
          }}
        />
      )}

      {screen === 'kaimenSchedule' && isTaikyo(auth.role) && pickedKaimenId && (
        <KaimenScheduleScreen kaimenId={pickedKaimenId} onClose={() => setScreen('kaimenPicker')} />
      )}

      {screen === 'jointScheduleAdmin' && isTaikyo(auth.role) && pickedJointIds && (
        <JointScheduleScreen kaimenIds={pickedJointIds} onClose={() => setScreen('kaimenPicker')} />
      )}
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

  const self = (masters?.海面業者 || []).find((k) => k['海面業者ID'] === auth.refId);
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

  if (!auth) return <LoginScreen />;

  return (
    <MasterProvider>
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
