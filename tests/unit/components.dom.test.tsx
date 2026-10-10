import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../src/renderer/components/Button';
import { Chip } from '../../src/renderer/components/Chip';
import { Modal } from '../../src/renderer/components/Modal';
import { ScoreChip } from '../../src/renderer/components/ScoreChip';
import { Table } from '../../src/renderer/components/Table';
import type { Column } from '../../src/renderer/components/Table';
import { Tabs } from '../../src/renderer/components/Tabs';
import { ToastHost, toast, useToastStore } from '../../src/renderer/components/Toast';
import { Input } from '../../src/renderer/components/Input';

// vitest.config has no automatic JSX runtime; classic transform needs React in scope at render time.
(globalThis as { React?: unknown }).React = React;

afterEach(() => { cleanup(); useToastStore.getState().clear(); vi.useRealTimers(); });

describe('base components', () => {
  it('Button is 28 high, icon-only 28x28', () => {
    render(<><Button>Go</Button><Button iconOnly aria-label="i" /></>);
    expect(screen.getByText('Go').style.height).toBe('28px');
    const icon = screen.getByLabelText('i');
    expect(icon.style.height).toBe('28px');
    expect(icon.style.width).toBe('28px');
  });
  it('Chip 18, Tabs 32, Input 28', () => {
    const { container } = render(<><Chip>x</Chip><Tabs tabs={[{ id: 'a', label: 'A' }]} active="a" onChange={() => undefined} /><Input aria-label="in" /></>);
    expect(screen.getByText('x').style.height).toBe('18px');
    expect((container.querySelector('[role="tablist"]') as HTMLElement).style.height).toBe('32px');
    expect(screen.getByLabelText('in').style.height).toBe('28px');
  });
  it('ScoreChip is 40x18, big 56x24, low data is dashed and shows ?', () => {
    render(<><ScoreChip score={38} band="MEDIUM" completeness={0.8} /><ScoreChip big score={38} band="MEDIUM" completeness={0.8} /><ScoreChip score={10} band="LOW" completeness={0.2} /></>);
    const [a, b, c] = screen.getAllByTestId('score-chip') as HTMLElement[];
    expect([a?.style.width, a?.style.height]).toEqual(['40px', '18px']);
    expect([b?.style.width, b?.style.height]).toEqual(['56px', '24px']);
    expect(c?.style.border).toContain('dashed');
    expect(screen.getByText('LOW?')).toBeTruthy();
  });
});

interface R { id: number }
const cols: Column<R>[] = [{ id: 'id', header: 'ID', width: 80, sortKey: 'id', render: (r) => String(r.id) }];

describe('Table', () => {
  it('renders 5000 rows with fewer than 60 DOM rows', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({ id: i }));
    const { container } = render(<div style={{ height: 600 }}><Table columns={cols} rows={rows} rowKey={(r) => String(r.id)} /></div>);
    const n = container.querySelectorAll('[data-row]').length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(60);
  });
  it('arrow keys move selection and Enter activates', () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const onSelect = vi.fn(); const onActivate = vi.fn();
    const { container } = render(<Table columns={cols} rows={rows} rowKey={(r) => String(r.id)} selectedKey="1" onSelect={onSelect} onActivate={onActivate} />);
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenCalledWith({ id: 2 }, 1);
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(onActivate).toHaveBeenCalledWith({ id: 1 });
  });
});

describe('Modal', () => {
  it('Esc closes', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="T"><button>ok</button></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('traps focus with Tab', () => {
    render(<Modal open onClose={() => undefined}><button>one</button><button>two</button></Modal>);
    const two = screen.getByText('two');
    two.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('one'));
  });
});

describe('Toast', () => {
  it('shows at most 3 at once', () => {
    render(<ToastHost />);
    act(() => { for (let i = 0; i < 5; i++) toast(`msg ${i}`); });
    expect(screen.getAllByTestId('toast')).toHaveLength(3);
  });
  it('auto-dismisses after 5 s and hover pauses', () => {
    vi.useFakeTimers();
    render(<ToastHost />);
    act(() => { toast('hello'); });
    const el = screen.getByTestId('toast');
    act(() => { vi.advanceTimersByTime(3000); });
    fireEvent.mouseEnter(el);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.queryByTestId('toast')).not.toBeNull();
    fireEvent.mouseLeave(el);
    act(() => { vi.advanceTimersByTime(2100); });
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});
