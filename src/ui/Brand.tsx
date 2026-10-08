import logoUrl from '../assets/promaintain-logo.png';
import wordmarkUrl from '../assets/promaintain-wordmark.png';
import { cx } from './common';

/** promaintain corporate identity */
export const BRAND = {
  name: 'promaintain',
  tagline: 'Nah am Kunden. Nah am Projekt.',
  blue: '#004F7E',
  green: '#AFCB51',
};

/** Word mark without tagline (header, dialogs) on a white plate so it stays legible in dark mode */
export function Wordmark({ className, height = 'h-5' }: { className?: string; height?: string }) {
  return (
    <span className={cx('brand-plate', className)}>
      <img src={wordmarkUrl} alt={BRAND.name} className={cx(height, 'w-auto')} draggable={false} />
    </span>
  );
}

/** Full logo with tagline (welcome screen, print report) */
export function FullLogo({ className }: { className?: string }) {
  return <img src={logoUrl} alt={`${BRAND.name} – ${BRAND.tagline}`} className={cx('w-auto', className)} draggable={false} />;
}
