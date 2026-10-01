import { useEffect } from 'react';
import { RacePhase } from '../shared/types';
import { Toasts } from './components/Toasts';
import { initNetwork } from './networking/actions';
import { loadNickname } from './networking/session';
import { ConnectingScreen } from './screens/ConnectingScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { MenuScreen } from './screens/MenuScreen';
import { RaceScreen } from './screens/RaceScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { setState, useGame } from './state/store';

export function App() {
  const conn = useGame((s) => s.conn);
  const everConnected = useGame((s) => s.everConnected);
  const room = useGame((s) => s.room);

  useEffect(() => {
    setState({ nickname: loadNickname() });
    initNetwork();
  }, []);

  let screen;
  if (!everConnected) {
    screen = <ConnectingScreen failed={conn === 'failed'} />;
  } else if (!room) {
    screen = <MenuScreen />;
  } else {
    switch (room.phase) {
      case RacePhase.WAITING: screen = <LobbyScreen />; break;
      case RacePhase.RESULTS: screen = <ResultsScreen />; break;
      default: screen = <RaceScreen />;
    }
  }

  return (
    <>
      {screen}
      {everConnected && conn !== 'connected' && (
        <div className="conn-overlay" role="alert">
          {conn === 'failed' ? 'Unable to connect to the game server.' : 'Connection lost. Reconnecting…'}
        </div>
      )}
      <Toasts />
    </>
  );
}
