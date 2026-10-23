import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompactSlotWidget from './compact-slot-widget';

vi.mock('@surfpool/shared',()=>({logger:{log:vi.fn()}}));
function deferred<T=any>() { let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve}; }
function reply(absoluteSlot:number) {
 return {ok:true,json:async()=>({result:{epoch:10,absoluteSlot,slotIndex:absoluteSlot-10000,slotsInEpoch:1000}})} as Response;
}
class Service extends EventEmitter {
 connect=vi.fn(async()=>{this.emit('connected');});
 subscribeToSlots=vi.fn(async()=>'slots');
 isConnected=()=>true;
}
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
let service:Service;
let fetcher:ReturnType<typeof vi.fn>;
function mount(historical=true) {
 const view=render(<CompactSlotWidget rpcUrl="http://fork.invalid" wsUrl="ws://fork.invalid"
  solanaWebSocketService={service} historical={historical}/>);
 const slot=()=>Number([...view.container.querySelectorAll('span')].find(span=>span.textContent==='Slot')!
  .nextElementSibling!.textContent!.replaceAll(',',''));
 return {...view,slot};
}
beforeEach(()=>{
 vi.useFakeTimers();service=new Service();fetcher=vi.fn(async()=>reply(10020));
 vi.stubGlobal('fetch',fetcher);
 vi.stubGlobal('MutationObserver',class {observe(){} disconnect(){}});
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
describe('historical slot authority on reconnect',()=>{
 it('refreshes a frozen restarted fork from getEpochInfo without awaiting a slot notification',async()=>{
  const view=mount();await act(flush);expect(view.slot()).toBe(10020);
  act(()=>{service.emit('slot',{slot:10030,parent:10029});});
  expect(view.slot()).toBe(10030);
  await act(async()=>{service.emit('disconnected');service.emit('connected');await flush();});
  expect(view.slot()).toBe(10020);
  expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('ignores a stale initial epoch fetch completed after the reconnect fetch',async()=>{
  const old=deferred<Response>();fetcher.mockImplementationOnce(()=>old.promise);
  const view=mount();await act(flush);
  await act(async()=>{service.emit('disconnected');service.emit('connected');await flush();});
  expect(view.slot()).toBe(10020);
  await act(async()=>{old.resolve(reply(10099));await flush();});
  expect(view.slot()).toBe(10020);
 });
 it('aborts pending epoch acquisition on unmount',async()=>{
  const old=deferred<Response>();fetcher.mockImplementationOnce(()=>old.promise);
  const view=mount();await act(flush);
  const signal=fetcher.mock.calls[0][1].signal as AbortSignal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async()=>{old.resolve(reply(10099));await flush();});
 });
 it('keeps normal-mode epoch-index display and does not fetch on reconnect',async()=>{
  const view=mount(false);await act(flush);expect(view.slot()).toBe(20);
  act(()=>{service.emit('slot',{slot:10030,parent:10029});});
  expect(view.slot()).toBe(29);
  await act(async()=>{service.emit('disconnected');service.emit('connected');await flush();});
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(view.slot()).toBe(29);
 });
});
