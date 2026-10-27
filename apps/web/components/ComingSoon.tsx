import { EmptyState } from './EmptyState';

/** Sections that exist in the design but are not wired to data yet. No sample numbers are shown. */
export function ComingSoon({ icon, title, children }: { icon: string; title: string; children: string }) {
  return (
    <div style={{ maxWidth: 560 }}>
      <EmptyState icon={icon} title={title}>{children}</EmptyState>
    </div>
  );
}
