import { useLayoutEffect } from 'react';

export function interfaceFontSize(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(24, Math.max(12, value))
    : 16;
}

export function useInterfaceFont(value: number | null | undefined): void {
  const size = interfaceFontSize(value);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = `${size}px`;
    return () => {
      root.style.fontSize = previous;
    };
  }, [size]);
}
