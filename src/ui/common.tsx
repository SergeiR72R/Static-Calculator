import { useId, useState, type ReactNode } from 'react';
import { Popover, Switch as RSwitch, Tooltip as RTooltip } from 'radix-ui';
import { parseNumber } from '../units/format';
import type { Quantity } from '../units/units';
import { useFieldIssues, useFmt } from './hooks';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

export function Button({
  children,
  variant = 'default',
  size = 'md',
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500 disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
        variant === 'primary' && 'bg-accent-700 text-white hover:bg-accent-800',
        variant === 'default' &&
          'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
        variant === 'ghost' && 'text-slate-700 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-slate-800',
        variant === 'danger' && 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950',
        className,
      )}
      {...p}
    >
      {children}
    </button>
  );
}

export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <RTooltip.Root delayDuration={350}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          sideOffset={4}
          className="no-print z-50 max-w-xs rounded bg-slate-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
        >
          {content}
          <RTooltip.Arrow className="fill-slate-900 dark:fill-slate-100" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

/**
 * "?" beside a setting: a click opens what the setting is, why it is needed and what it changes
 * (texts under help.<id>.what / .why / .effect).
 */
export function HelpTip({ id, title }: { id: string; title?: string }) {
  const fmt = useFmt();
  const k = `help.${id}`;
  const tid = id.replace(/\./g, '-');
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={title ? `${fmt.t('help.button')}: ${title}` : fmt.t('help.button')}
          data-testid={`help-${tid}`}
          className="no-print inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-slate-400 text-[9px] font-bold leading-none text-slate-500 hover:border-accent-600 hover:text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500 data-[state=open]:border-accent-700 data-[state=open]:bg-accent-700 data-[state=open]:text-white dark:border-slate-500 dark:text-slate-400"
        >
          ?
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          data-testid={`help-text-${tid}`}
          className="no-print z-50 w-80 max-w-[calc(100vw-16px)] rounded-md border border-slate-200 bg-white p-3 text-xs leading-snug text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          {title && <p className="mb-1.5 font-semibold text-slate-900 dark:text-slate-50">{title}</p>}
          <dl className="space-y-1.5">
            {(['what', 'why', 'effect'] as const).map((p) => (
              <div key={p}>
                <dt className="text-[10px] font-semibold tracking-wide text-accent-700 uppercase dark:text-accent-300">{fmt.t(`help.${p}`)}</dt>
                <dd>{fmt.t(`${k}.${p}`)}</dd>
              </div>
            ))}
          </dl>
          <Popover.Arrow className="fill-white dark:fill-slate-900" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** label of a field with the "?" of its help */
function FieldLabel({ htmlFor, help, title, children }: { htmlFor: string; help?: string; title?: string; children: ReactNode }) {
  return (
    <div className="mb-0.5 flex min-w-0 items-center gap-1">
      <label htmlFor={htmlFor} className="block min-w-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        {children}
      </label>
      {help && <HelpTip id={help} title={title} />}
    </div>
  );
}

/** checkbox with its label and the "?" of its help beside (outside the label, so the click does not toggle) */
export function CheckField({
  checked,
  onChange,
  label,
  help,
  testId,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  help?: string;
  testId?: string;
  className?: string;
}) {
  return (
    <div className={cx('flex items-center gap-1.5', className)}>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
        {label}
      </label>
      {help && <HelpTip id={help} title={typeof label === 'string' ? label : undefined} />}
    </div>
  );
}

const inputBase =
  'h-7 w-full min-w-0 rounded border bg-white px-1.5 text-sm num outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 dark:bg-slate-900';

interface NumberFieldProps {
  /** value in SI units */
  value: number;
  q?: Quantity;
  onChange: (si: number) => void;
  /** model path for validation messages */
  path?: string;
  label?: string;
  /** show unit symbol after the field */
  showUnit?: boolean;
  className?: string;
  disabled?: boolean;
  testId?: string;
  ariaLabel?: string;
  /** key of the help texts (help.<key>.what / .why / .effect): a "?" beside the label */
  help?: string;
}

/**
 * Number input: accepts comma or point, converts display units ↔ SI, recalculates on every
 * valid keystroke and shows validation messages of the analysis for its model path.
 */
export function NumberField({ value, q = 'factor', onChange, path, label, showUnit, className, disabled, testId, ariaLabel, help }: NumberFieldProps) {
  const fmt = useFmt();
  const id = useId();
  // text being edited; null while the field is not focused (then the model value is shown)
  const [edit, setEdit] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const issues = useFieldIssues(path);
  const text = edit ?? fmt.input(value, q);
  const err = issues.find((i) => i.severity === 'error');
  const warn = issues.find((i) => i.severity === 'warning');
  const msg = bad ? fmt.t('err.number') : err ? fmt.issue(err) : warn ? fmt.issue(warn) : '';
  const unit = fmt.unit(q);
  return (
    <div className={cx('min-w-0', className)}>
      {label && (
        <FieldLabel htmlFor={id} help={help} title={label}>
          {label}
          {unit && !showUnit ? <span className="font-normal"> [{unit}]</span> : null}
        </FieldLabel>
      )}
      <div className="flex items-center gap-1">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={ariaLabel ?? label}
          aria-invalid={!!(bad || err)}
          data-testid={testId}
          disabled={disabled}
          value={text}
          title={msg || undefined}
          className={cx(
            inputBase,
            bad || err
              ? 'border-red-500 text-red-700 dark:text-red-300'
              : warn
                ? 'border-amber-500'
                : 'border-slate-300 dark:border-slate-600',
          )}
          onFocus={() => setEdit(fmt.input(value, q))}
          onBlur={() => {
            setEdit(null);
            setBad(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onChange={(e) => {
            setEdit(e.target.value);
            const v = parseNumber(e.target.value);
            if (Number.isFinite(v)) {
              setBad(false);
              const si = fmt.si(v, q);
              if (si !== value) onChange(si);
            } else setBad(true);
          }}
        />
        {showUnit && unit && <span className="shrink-0 text-xs text-slate-500">{unit}</span>}
      </div>
      {msg && (
        <p role="alert" className={cx('mt-0.5 text-[11px] leading-tight', bad || err ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>
          {msg}
        </p>
      )}
    </div>
  );
}

export function TextField({
  value,
  onChange,
  label,
  className,
  placeholder,
  testId,
  help,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  className?: string;
  placeholder?: string;
  testId?: string;
  help?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <FieldLabel htmlFor={id} help={help} title={label}>
          {label}
        </FieldLabel>
      )}
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
        className={cx(inputBase, 'border-slate-300 dark:border-slate-600')}
      />
    </div>
  );
}

export function SelectField<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  testId,
  ariaLabel,
  help,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
  className?: string;
  testId?: string;
  ariaLabel?: string;
  help?: string;
}) {
  const id = useId();
  return (
    <div className={cx('min-w-0', className)}>
      {label && (
        <FieldLabel htmlFor={id} help={help} title={label}>
          {label}
        </FieldLabel>
      )}
      <select
        id={id}
        value={value}
        data-testid={testId}
        aria-label={ariaLabel ?? label}
        onChange={(e) => onChange(e.target.value as T)}
        className={cx(inputBase, 'border-slate-300 pe-5 dark:border-slate-600')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SwitchField({
  checked,
  onChange,
  label,
  hint,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2 py-1">
      <RSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        data-testid={testId}
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-slate-300 transition-colors data-[state=checked]:bg-accent-600 dark:bg-slate-600"
      >
        <RSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px] rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-[18px]" />
      </RSwitch.Root>
      <label htmlFor={id} className="text-sm leading-tight">
        {label}
        {hint && <span className="block text-[11px] text-slate-500 dark:text-slate-400">{hint}</span>}
      </label>
    </div>
  );
}

export function Card({ title, children, className, actions, testId }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode; testId?: string }) {
  return (
    <section
      data-testid={testId}
      className={cx('rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900', className)}
    >
      {(title || actions) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Card under a spoiler: closed by default, the title with a short state (e.g. how many are set);
 * for what is seldom needed.
 */
export function FoldCard({ title, state, children, testId, defaultOpen }: { title: ReactNode; state?: ReactNode; children: ReactNode; testId?: string; defaultOpen?: boolean }) {
  return (
    <details
      data-testid={testId}
      open={defaultOpen}
      className="group rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 [&::-webkit-details-marker]:hidden" data-testid={testId ? `${testId}-toggle` : undefined}>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span className="inline-block w-3 text-slate-400 transition-transform group-open:rotate-90 rtl:-scale-x-100" aria-hidden>
            ▸
          </span>
          {title}
        </span>
        {state}
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

/** short state in the title of a FoldCard: what is set, or "none" */
export function FoldState({ items }: { items: string[] }) {
  const fmt = useFmt();
  return items.length ? (
    <span className="rounded-full bg-accent-700 px-2 py-0.5 text-[10px] font-semibold text-white" data-testid="fold-state">
      {items.join(' + ')}
    </span>
  ) : (
    <span className="text-[11px] font-normal text-slate-500">{fmt.t('scaffold.fold.none')}</span>
  );
}

export function Badge({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold',
        ok ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
      )}
    >
      {children}
    </span>
  );
}

/** Browser download of a text or binary payload */
export function downloadBlob(data: BlobPart, filename: string, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
