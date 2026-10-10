import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Modal, ModalButtons } from '../../components/Modal';
import { invoke } from '../../state/hooks';

/** Shown once on a fresh profile: not advice, no guarantees. Dismissing calls app:firstRun. */
export function FirstRunNotice() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    void invoke('app:info', {}).then((r) => { if (live && r.ok && !r.value.firstRunDone) setOpen(true); });
    return () => { live = false; };
  }, []);
  const close = () => { setOpen(false); void invoke('app:firstRun', { done: true }); };
  return (
    <Modal open={open} onClose={close} width={520} title="Welcome to TickLab Radar">
      <div style={{ fontSize: 13, lineHeight: '18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0 }}><b>This is not advice, and there are no guarantees.</b> TickLab Radar is a research tool. A risk score counts warning signs; it does not predict prices, and a low score is not a safety signal.</p>
        <p style={{ margin: 0 }}>It uses two windows: the Feed window lists new launches, and the Detail window (handy on a second monitor) follows the row you select.</p>
        <p style={{ margin: 0 }}>The app never holds private keys and never places orders. You can add optional RPC and AI keys later in Settings.</p>
      </div>
      <ModalButtons><Button variant="primary" onClick={close}>I understand</Button></ModalButtons>
    </Modal>
  );
}
