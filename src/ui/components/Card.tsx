import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-line bg-surface p-4 ${className}`}>{children}</section>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 px-1 text-sm font-medium text-muted">{children}</h2>;
}
