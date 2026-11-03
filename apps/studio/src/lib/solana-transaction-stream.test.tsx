import { act, cleanup, renderHook } from '@testing-library/react';
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state=vi.hoisted(()=>({service:null as any}));
vi.mock('@surfpool/shared',()=>({logger:{log:vi.fn()}}));
vi.mock('@solana/spl-token',()=>({}));
vi.mock('@solana/web3.js',()=>({}));
vi.mock('./address-utils',()=>({}));
vi.mock('./solana-websocket-service',()=>({
 solanaWebSocketService:new Proxy({}, {get:(_,key)=>{const value=state.service[key];return typeof value==='function'?value.bind(state.service):value;}}),
 SolanaWebSocketService:{convertHttpToWebSocket:(value:string)=>value}
}));
import { useTransactionInspector } from './solana-transaction-stream';

function deferred<T=any>() { let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve}; }
function reply(result:any) { return {ok:true,status:200,json:async()=>({result})} as Response; }
function tx(signature:string) { return {slot:100,meta:{err:null,fee:1},transaction:{signatures:[signature],message:{instructions:[],accountKeys:[]}}}; }
class Service extends EventEmitter {
 activeSubscriptions=new Set<string>();
 connect=vi.fn(async()=>{this.emit('connected');});
 subscribeToTransactions=vi.fn<()=>Promise<string>>(async()=>{
  const id='logs-'+this.subscribeToTransactions.mock.calls.length;this.activeSubscriptions.add(id);return id;
 });
 subscribeToSlots=vi.fn(async()=>'slots-'+this.subscribeToSlots.mock.calls.length);
 unsubscribeAll=vi.fn(()=>this.activeSubscriptions.clear());
 unsubscribe=vi.fn((id:string)=>this.activeSubscriptions.delete(id));
}
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const signatures=(result:any)=>result.current.transactions.map((item:any)=>item.transaction.signatures[0]);
let service:Service;
let local:string[];
let route:(request:any)=>Promise<Response>;
function mount(options:any={}) {
 return renderHook(()=>useTransactionInspector({rpcUrl:'http://fork.invalid',wsUrl:'ws://fork.invalid',reconcile:true,...options}));
}
beforeEach(()=>{
 service=new Service();state.service=service;local=[];
 route=async q=>reply(q.method==='surfnet_getLocalSignatures'?{value:local.map(signature=>({signature}))}:tx(q.params[0]));
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>route(JSON.parse(init.body))));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function notify(signature:string) {
 await act(async()=>{service.emit('transaction',{value:{signature}});await flush();});
}
async function slot() {
 await act(async()=>{service.emit('slot',{slot:100,parent:99});await flush();});
}
describe('historical list response ordering',()=>{
 it('does not resurrect an old detail after reset clears visible transactions',async()=>{
  const late=deferred<Response>();const original=route;
  route=q=>q.method==='getTransaction'&&q.params[0]==='pending'?late.promise:original(q);
  const h=mount();await act(flush);local=['visible'];await notify('visible');
  act(()=>{service.emit('transaction',{value:{signature:'pending'}});});
  local=[];await slot();expect(signatures(h.result)).toEqual([]);
  await act(async()=>{late.resolve(reply(tx('pending')));await flush();});
  expect(signatures(h.result)).toEqual([]);
 });
 it('invalidates a pending old detail even when the list was initially empty',async()=>{
  const late=deferred<Response>();const original=route;
  route=q=>q.method==='getTransaction'?late.promise:original(q);
  const h=mount();await act(flush);
  act(()=>{service.emit('transaction',{value:{signature:'pending'}});});
  await slot();
  await act(async()=>{late.resolve(reply(tx('pending')));await flush();});
  expect(signatures(h.result)).toEqual([]);
 });
 it('ignores an old local-history response completed after reset reconciliation',async()=>{
  const oldHistory=deferred<Response>();let inventoryReads=0;
  route=async q=>{
   if(q.method==='surfnet_getLocalSignatures'){
    inventoryReads++;return inventoryReads===1?oldHistory.promise:reply({value:[]});
   }
   return reply(tx(q.params[0]));
  };
  const h=mount();await act(flush);await slot();
  await act(async()=>{oldHistory.resolve(reply({value:[{signature:'old-history'}]}));await flush();});
  expect(signatures(h.result)).toEqual([]);
 });
 it('ignores an older reconciliation response after a newer response',async()=>{
  const oldInventory=deferred<Response>();let inventoryReads=0;
  const h=mount({fetchHistorical:false});await act(flush);await notify('kept');
  route=async q=>q.method==='surfnet_getLocalSignatures'?
   (++inventoryReads===1?oldInventory.promise:reply({value:[{signature:'kept'}]})):reply(tx(q.params[0]));
  act(()=>{service.emit('slot',{slot:100,parent:99});});
  await slot();
  await act(async()=>{oldInventory.resolve(reply({value:[]}));await flush();});
  expect(signatures(h.result)).toEqual(['kept']);
 });
 it('does not erase a transaction fetched after the inventory request began',async()=>{
  const olderInventory=deferred<Response>();
  const h=mount({fetchHistorical:false});await act(flush);
  route=async q=>q.method==='surfnet_getLocalSignatures'?olderInventory.promise:reply(tx(q.params[0]));
  act(()=>{service.emit('slot',{slot:100,parent:99});});
  await notify('newer');
  await act(async()=>{olderInventory.resolve(reply({value:[]}));await flush();});
  expect(signatures(h.result)).toEqual(['newer']);
 });
 it('accepts fresh transactions after a completed reset',async()=>{
  const h=mount();await act(flush);local=['old'];await notify('old');
  local=[];await slot();local=['fresh'];await notify('fresh');
  expect(signatures(h.result)).toEqual(['fresh']);
 });
});
describe('historical stream intent',()=>{
 it('does not subscribe on reconnect when autoStart is false',async()=>{
  const h=mount({autoStart:false,fetchHistorical:false});await act(flush);
  await act(async()=>{service.emit('disconnected');service.emit('connected');await flush();});
  expect(service.subscribeToTransactions).not.toHaveBeenCalled();
  expect(h.result.current.isStreaming).toBe(false);
 });
 it('preserves explicit stop across reconnect',async()=>{
  const h=mount({fetchHistorical:false});await act(flush);
  act(()=>h.result.current.stopStreaming());
  await act(async()=>{service.emit('disconnected');service.emit('connected');await flush();});
  expect(service.subscribeToTransactions).toHaveBeenCalledTimes(1);
  expect(h.result.current.isStreaming).toBe(false);
 });
 it('cancels a subscription confirmed after stop during async reconnect',async()=>{
  const h=mount({fetchHistorical:false});await act(flush);
  const pending=deferred<string>();service.subscribeToTransactions.mockImplementationOnce(()=>pending.promise.then(id=>{service.activeSubscriptions.add(id);return id;}));
  act(()=>{service.emit('disconnected');service.emit('connected');});
  act(()=>h.result.current.stopStreaming());
  await act(async()=>{pending.resolve('late-reconnect');await flush();});
  expect(service.activeSubscriptions.has('late-reconnect')).toBe(false);
  expect(service.subscribeToSlots).toHaveBeenCalledTimes(1);
  expect(h.result.current.isStreaming).toBe(false);
 });
 it('does not finish subscriptions after unmount',async()=>{
  const h=mount({fetchHistorical:false});await act(flush);
  const pending=deferred<string>();service.subscribeToTransactions.mockImplementationOnce(()=>pending.promise.then(id=>{service.activeSubscriptions.add(id);return id;}));
  act(()=>{service.emit('disconnected');service.emit('connected');});h.unmount();
  await act(async()=>{pending.resolve('late-unmounted');await flush();});
  expect(service.activeSubscriptions.has('late-unmounted')).toBe(false);
  expect(service.subscribeToSlots).toHaveBeenCalledTimes(1);
 });
 it('keeps an active historical stream subscribed after reconnect',async()=>{
  const h=mount({fetchHistorical:false});await act(flush);
  await act(async()=>{service.emit('disconnected');service.emit('connected');await flush();});
  expect(service.subscribeToTransactions).toHaveBeenCalledTimes(2);
  expect(h.result.current.isStreaming).toBe(true);
 });
 it('restores an active normal-mode subscription after reconnect',async()=>{
  const h=mount({reconcile:false,fetchHistorical:false});await act(flush);
  await act(async()=>{service.emit('disconnected');service.emit('connected');await flush();});
  expect(service.subscribeToTransactions).toHaveBeenCalledTimes(2);
  expect(h.result.current.isStreaming).toBe(true);
 });
});
