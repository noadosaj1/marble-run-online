import { Button } from '../components/Button';
import { socket } from '../networking/socket';
import { setState } from '../state/store';

export function ConnectingScreen({ failed }: { failed: boolean }) {
  return (
    <div className="screen center-screen">
      <div className="bouncer" aria-hidden />
      {failed ? (
        <>
          <h2 className="status-title">Unable to connect to the game server.</h2>
          <p className="muted">Check your connection, or that the server is running.</p>
          <Button onClick={() => { setState({ conn: 'connecting' }); socket.connect(); }}>RETRY</Button>
        </>
      ) : (
        <h2 className="status-title">Connecting<span className="dots" /></h2>
      )}
    </div>
  );
}
