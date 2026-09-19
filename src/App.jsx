import { useState } from 'react';
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
import LocationsScreen from './screens/LocationsScreen';
import NavBar from './components/NavBar';

// 太協・内水面業者・運送会社向け（従来通りの操作画面一式）
function MainShell() {
  const { auth } = useAuth();
  const { reload: reloadMasters } = useMasters();
  const [screen, setScreen] = useState('home');

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
    if (auth.role !== '太協') return;
    setEditingSchedule(null);
    setFormReturnScreen('scheduleList');
    setScreen('scheduleForm');
  }

  // 車輌をタップ→編集メニューを開く。fromは呼び出し元の画面（'home' | 'scheduleList'）。
  // 編集メニューを閉じると、この画面の、この車輌が含まれる業者グループを開いた状態で戻る。
  function openEditMenu(schedule, from) {
    if (auth.role !== '太協') return;
    setActiveSchedule(schedule);
    setReturnScreen(from);
    setReturnFocus({ date: schedule['積込日'], ikebaId: schedule['池場ID'], kaimenId: schedule['海面業者ID'] });
    setScreen('editMenu');
  }

  // 編集メニューの4つのボタン
  function selectMenuAction(target) {
    if (target === 'scheduleForm') {
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

      {screen === 'scheduleForm' && auth.role === '太協' && (
        <ScheduleFormScreen
          initial={editingSchedule}
          onSaved={closeScheduleForm}
          onCancelEdit={closeScheduleForm}
          onOpenLoadingResult={() => setScreen('loadingResultForm')}
        />
      )}

      {screen === 'editMenu' && auth.role === '太協' && activeSchedule && (
        <EditMenuScreen schedule={activeSchedule} onSelect={selectMenuAction} onClose={closeEditMenu} />
      )}

      {screen === 'loadingResultForm' && auth.role === '太協' && activeSchedule && (
        <LoadingResultFormScreen
          schedule={activeSchedule}
          onClose={closeToEditMenu}
          onOpenDeliveryResult={() => setScreen('deliveryResultForm')}
        />
      )}

      {screen === 'deliveryResultForm' && auth.role === '太協' && activeSchedule && (
        <DeliveryResultFormScreen schedule={activeSchedule} onSaved={closeToEditMenu} onClose={closeToEditMenu} />
      )}

      {screen === 'bulkActions' && auth.role === '太協' && activeSchedule && (
        <BulkActionsScreen schedule={activeSchedule} onClose={closeToEditMenu} />
      )}

      {screen === 'changeLog' && auth.role === '太協' && <ChangeLogScreen />}

      {screen === 'contacts' && (auth.role === '太協' || auth.role === '運送会社') && <ContactsScreen />}

      {screen === 'locations' && (auth.role === '太協' || auth.role === '運送会社') && <LocationsScreen />}

      {screen === 'kaimenPicker' && auth.role === '太協' && (
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

      {screen === 'kaimenSchedule' && auth.role === '太協' && pickedKaimenId && (
        <KaimenScheduleScreen kaimenId={pickedKaimenId} onClose={() => setScreen('kaimenPicker')} />
      )}

      {screen === 'jointScheduleAdmin' && auth.role === '太協' && pickedJointIds && (
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
