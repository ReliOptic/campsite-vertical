import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as c from '../src/index';
const fixture=(name:string)=>JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`,import.meta.url),'utf8'));

test('contract version is 6.0.0 and R5.8 fixtures still parse',()=>{
  assert.equal(c.CONTRACT_VERSION,'6.0.0');
  for(const [name,schema] of Object.entries({me:c.MeResponse,channels:c.ChannelsResponse,feed:c.FeedResponse,vista:c.VistaResponse,job:c.Job,manifest:c.Manifest}))schema.parse(fixture(name));
});

test('R6.0 fixtures parse against their schemas',()=>{
  const map:Record<string,{parse:(v:unknown)=>unknown}>={
    modelConnection:c.ModelResponse, modelDisconnected:c.ModelResponse, connectModel:c.ConnectModel,
    scheduledChannel:c.Channel, forkedChannel:c.Channel, skippedRun:c.RunResponse,
    discovery:c.DiscoveryResponse, emptyDiscovery:c.DiscoveryResponse,
    subscriptions:c.SubscriptionsResponse, fork:c.ForkResponse, publication:c.PublishResponse,
    ask:c.AskResponse, vistaState:c.VistaStateResponse, stateCommit:c.CommitState, runtime:c.RuntimeResponse,
    manifest3d:c.Manifest, modelNotConnected:c.ErrorResponse, devLogin:c.DevLogin,
  };
  for(const [name,schema] of Object.entries(map))schema.parse(fixture(name));
});

test('run status gains SKIPPED and trigger kinds; fail codes unchanged',()=>{
  assert.equal(c.RunStatus.safeParse('SKIPPED').success,true);
  assert.equal(c.RunStatus.safeParse('CANCELED').success,false);
  assert.deepEqual(c.RunTrigger.options,['initial','manual','scheduled','fork']);
  assert.equal(c.FailCode.options.length,6);
  assert.equal(c.ErrorCode.safeParse('MODEL_NOT_CONNECTED').success,true);
  assert.equal(c.ErrorCode.safeParse('INVALID_KEY').success,true);
});

test('model connection never echoes the key',()=>{
  const r=c.ModelConnection.safeParse({provider:'openrouter',modelId:'x',keyHint:'sk-or-…ab12',verifiedAt:'2026-10-10T00:00:00.000Z',apiKey:'leak'});
  assert.equal(r.success,false);
  assert.equal(c.ConnectModel.safeParse({provider:'openrouter',apiKey:'short'}).success,false);
  assert.equal(c.ConnectModel.safeParse({provider:'openrouter',apiKey:'sk-or-v1-'+'a'.repeat(32),modelId:'openrouter/auto'}).success,true);
});

test('manifest v1 accepts additive features, scenes and captions; rejects unknown keys',()=>{
  const m=fixture('manifest3d');
  assert.deepEqual(m.features,['motion','3d','interactive']);
  assert.equal(c.Manifest.safeParse({...m,extra:1}).success,false);
  assert.equal(c.Manifest.safeParse({...m,scenes:[{id:'a',label:'A',atMs:0},{id:'a',label:'B',atMs:10}]}).success,false,'duplicate scene ids');
});

test('bridge messages: host→vista and vista→host sets are closed',()=>{
  assert.equal(c.HostMessage.safeParse({type:'campsite:seek',atMs:1200}).success,true);
  assert.equal(c.HostMessage.safeParse({type:'campsite:scene',sceneId:'intro'}).success,true);
  assert.equal(c.HostMessage.safeParse({type:'campsite:evil'}).success,false);
  assert.equal(c.VistaMessage.safeParse({type:'campsite:state',state:{scene:'intro',atMs:1200}}).success,true);
  assert.equal(c.VistaMessage.safeParse({type:'campsite:ready',durationMs:3000}).success,true);
  assert.equal(c.VistaMessage.safeParse({type:'campsite:state',state:{secret:'x'},token:'t'}).success,false);
});

test('semantic state commit is bounded and idempotent by key',()=>{
  const ok=c.CommitState.safeParse({baseStateRevision:3,idempotencyKey:'k'.repeat(12),patch:[{op:'replace',path:'/scene',value:'b'}]});
  assert.equal(ok.success,true);
  assert.equal(c.CommitState.safeParse({baseStateRevision:3,idempotencyKey:'k'.repeat(12),patch:[{op:'replace',path:'/__proto__/x',value:1}]}).success,false);
  assert.equal(c.CommitState.safeParse({baseStateRevision:3,idempotencyKey:'k'.repeat(12),patch:Array.from({length:200},()=>({op:'add',path:'/a',value:1}))}).success,false);
});

test('endpoints cover R6.0 surface, remain unique, and runner routes keep fencing',()=>{
  const keys=new Set(c.endpoints.map(e=>e.method+' '+e.path));
  assert.equal(keys.size,c.endpoints.length);
  for(const k of ['GET /api/model','POST /api/model','DELETE /api/model','GET /api/discovery','POST /api/vistas/:id/publish','DELETE /api/vistas/:id/publish','POST /api/subscriptions','DELETE /api/subscriptions/:channelId','GET /api/subscriptions','POST /api/forks','POST /api/ask','GET /api/vistas/:id/state','PUT /api/vistas/:id/state','PATCH /api/channels/:id','GET /api/runtime','POST /auth/dev/login'])assert.ok(keys.has(k),k);
  for(const e of c.endpoints.filter(e=>e.path.startsWith('/runner/runs/')))assert.ok('fencing' in e && e.fencing);
});

test('profiles gain concurrency and keep R5.8 limits',()=>{
  assert.equal(c.profiles.free.maxConcurrentRuns,1);
  assert.equal(c.profiles.pro.maxConcurrentRuns,4);
  assert.equal(c.profiles.free.maxChannels,1);
  assert.equal(c.profiles.plus.minScheduleIntervalMin,360);
});
