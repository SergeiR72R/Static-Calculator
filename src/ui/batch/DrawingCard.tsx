import { useState } from 'react';
import { useStore } from '../../state/store';
import { Button, Card } from '../common';
import { useFmt } from '../hooks';

/** Drawing of the active beam from the import (for comparison with the input) */
export function DrawingCard() {
  const fmt = useFmt();
  const src = useStore((s) => (s.batch ? s.batchImages[s.batch.active] : undefined));
  const [open, setOpen] = useState(true);
  if (!src) return null;
  return (
    <Card
      testId="drawing-card"
      title={fmt.t('batch.drawing')}
      actions={
        <Button size="sm" onClick={() => setOpen(!open)}>
          {fmt.t(open ? 'batch.hide' : 'batch.show')}
        </Button>
      }
    >
      {open && <img src={src} alt={fmt.t('batch.drawing')} className="mx-auto max-h-[320px] w-auto max-w-full rounded bg-white" />}
    </Card>
  );
}
