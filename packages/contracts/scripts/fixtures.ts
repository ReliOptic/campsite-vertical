import {writeFileSync} from 'node:fs';
const at='2026-10-10T00:00:00.000Z';
const later='2026-10-11T00:00:00.000Z';
const schedule={intervalMin:null,enabled:false,nextRunAt:null,lastRunAt:null};
const me={user:{id:'u_fixture',name:'Campsite',email:'reader@example.test',avatarUrl:null},workspaceId:'ws_fixture',plan:'free',usage:{channels:{used:0,max:1},runsToday:{used:0,max:3}},model:{connected:false},nextUpdateAt:null};
const channel={id:'ch_fixture',title:'HBM 시장',brief:'HBM 시장 구도를 비교해 주세요',createdAt:at,latestVistaId:null,latestPosterUrl:null,schedule,origin:null};
const scheduledChannel={...channel,id:'ch_sched',schedule:{intervalMin:1440,enabled:true,nextRunAt:later,lastRunAt:at}};
const forkedChannel={...channel,id:'ch_fork',origin:{channelId:'ch_fixture',workspaceId:'ws_other'}};
const job={runId:'r_fixture',channelId:'ch_fixture',attempt:1,prompt:channel.brief,channelBrief:channel.brief,recent:[],profile:'free',limits:{cpus:1,memMb:2048,timeoutSec:300,maxRepair:1,browser:false},model:{provider:'openrouter',modelId:'stub',apiKey:''},artifactVersion:'1',trigger:'initial'};
const manifest={schema:1,title:'HBM 시장',summary:'시장 비교',entry:'index.html',poster:'poster.png',aspect:'9:16',durationHintMs:30000,files:[{path:'index.html',sha256:'0'.repeat(64),bytes:100},{path:'poster.png',sha256:'1'.repeat(64),bytes:100}],generator:{runId:job.runId,modelId:'stub'}};
const manifest3d={...manifest,title:'데이터센터 전력 병목',summary:'전력→건설→서버→반도체 인과를 3D로',features:['motion','3d','interactive'],scenes:[{id:'intro',label:'한 줄 요약',atMs:0},{id:'chain',label:'인과 사슬',atMs:6000},{id:'outlook',label:'전망',atMs:18000}],captions:[{atMs:0,text:'전력이 먼저다'},{atMs:6000,text:'건설이 늦으면 서버도 늦는다'}],sources:[{label:'IEA 2026 전력 수요 전망'}]};
const posterUrl='https://vista.example.test/v/fixture/poster.png';
const feedItem={vistaId:'v_fixture',revisionId:'rev_fixture',channelId:channel.id,channelTitle:channel.title,title:manifest.title,summary:manifest.summary,posterUrl,aspect:'9:16',features:['motion'],published:false,origin:null,createdAt:at};
const feed={items:[feedItem],nextCursor:null};
const publisher={workspaceId:'ws_other',name:'Hana',avatarUrl:null};
const discoveryItem={...feedItem,vistaId:'v_pub',revisionId:'rev_pub',channelId:'ch_pub',published:true,publisher,publishedAt:at,subscribed:false,forkCount:2};
const vista={vistaId:'v_fixture',revisionId:'rev_fixture',channelId:channel.id,title:manifest.title,summary:manifest.summary,aspect:'9:16',features:['motion'],playUrl:'https://vista.example.test/v/fixture/index.html',posterUrl,expiresAt:'2026-10-10T00:10:00.000Z',published:false,owned:true,origin:null,durationHintMs:30000};
const modelConnection={connection:{provider:'openrouter',modelId:'openrouter/auto',keyHint:'sk-or-v1…ab12',verifiedAt:at,connectedAt:at},options:[{id:'openrouter/auto',label:'Auto',tier:'balanced'},{id:'google/gemini-2.5-flash-lite',label:'Gemini Flash Lite',tier:'cheap'}]};
const fixtures={
  me,channels:{items:[channel]},emptyChannels:{items:[]},scheduledChannel,forkedChannel,
  pendingRun:{status:'QUEUED',phase:'QUEUED',trigger:'initial'},failedRun:{status:'FAILED',phase:'VERIFYING',error:'VALIDATION_FAILED'},readyRun:{status:'READY',phase:'DONE',vistaId:'v_fixture'},skippedRun:{status:'SKIPPED',phase:'DONE',trigger:'scheduled'},
  feed,emptyFeed:{items:[],nextCursor:null},vista,job,manifest,manifest3d,
  channelLimit:{error:{code:'CHANNEL_LIMIT'}},runLimit:{error:{code:'RUN_LIMIT'}},modelNotConnected:{error:{code:'MODEL_NOT_CONNECTED'}},
  modelConnection,modelDisconnected:{connection:null,options:modelConnection.options},connectModel:{provider:'openrouter',apiKey:'sk-or-v1-'+'f'.repeat(48),modelId:'google/gemini-2.5-flash-lite',verify:true},
  discovery:{items:[discoveryItem],nextCursor:null},emptyDiscovery:{items:[],nextCursor:null},
  subscriptions:{items:[{channelId:'ch_pub',title:'전력 인프라',publisher,subscribedAt:at,latestVistaId:'v_pub',latestPosterUrl:posterUrl}]},
  fork:{channelId:'ch_fork',vistaId:'v_forkcopy',runId:null},publication:{vistaId:'v_fixture',publicationId:'pub_fixture',publishedAt:at},
  ask:{answer:'전력 공급 지연이 데이터센터 건설 일정을 밀어내고 있어요.',modelId:'google/gemini-2.5-flash-lite'},
  vistaState:{stateRevision:3,state:{scene:'chain',atMs:6400,fold:'open'},updatedAt:at},
  stateCommit:{baseStateRevision:3,idempotencyKey:'commit-0000000001',patch:[{op:'replace',path:'/scene',value:'outlook'}]},
  runtime:{runtimeId:'rt_ws_fixture',status:'idle',activeRuns:0,nextWakeAt:later},
  devLogin:{email:'a@campsite.test',name:'Account A'},
};
for(const [name,value] of Object.entries(fixtures))writeFileSync(`fixtures/${name}.json`,JSON.stringify(value,null,2)+'\n');
