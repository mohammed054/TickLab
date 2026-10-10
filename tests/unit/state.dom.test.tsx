import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { EventChannel } from '../../src/shared/ipc';
import { useIpcEvent } from '../../src/renderer/state/hooks';
import { freshFilters, unseenCount, useStore } from '../../src/renderer/state/store';

(globalThis as { React?: unknown }).React = React;
afterEach(cleanup);

describe('store', () => {
  it('filters patch and reset', () => {
    useStore.getState().setFilters({ minLiquidityUsd: 5000 });
    expect(useStore.getState().filters.minLiquidityUsd).toBe(5000);
    useStore.getState().resetFilters();
    expect(useStore.getState().filters).toEqual(freshFilters());
  });
  it('alerts cap at 50 and mark all seen', () => {
    for (let i = 1; i <= 60; i++) useStore.getState().pushAlert({ id: i, tokenId: 1, judgementId: null, createdAt: i, kind: 'worth_a_look', text: 't', seen: false });
    expect(useStore.getState().alerts).toHaveLength(50);
    expect(unseenCount(useStore.getState().alerts)).toBe(50);
    useStore.getState().markAllSeen();
    expect(unseenCount(useStore.getState().alerts)).toBe(0);
  });
});

describe('useIpcEvent', () => {
  it('leaves no listeners after 100 mount/unmount cycles', () => {
    let live = 0;
    (window as unknown as { api: unknown }).api = {
      on: (_c: EventChannel, _cb: unknown) => { live++; return () => { live--; }; },
      invoke: async () => ({ ok: true, value: null }),
    };
    function C() { useIpcEvent('evt:alert', () => undefined); return null; }
    for (let i = 0; i < 100; i++) render(<C />).unmount();
    expect(live).toBe(0);
  });
});
