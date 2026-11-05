import Link from 'next/link';
import { LanguageSwitch } from './LanguageSwitch';

// The way back to the Control Panel that the tools' pages show, with the
// language switch beside it. `className` places the pair (it was the link's own
// placement); `linkClassName` styles the link.
export function ControlPanelLink({
  label,
  className = '',
  linkClassName = 'text-blue-600 underline',
}: {
  label: string;
  className?: string;
  linkClassName?: string;
}) {
  return (
    <span className={`flex w-fit items-center gap-3 ${className}`}>
      <Link href="/control-panel" className={linkClassName}>
        {label}
      </Link>
      <LanguageSwitch inline />
    </span>
  );
}
