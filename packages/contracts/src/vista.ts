import {z} from 'zod';
import {Id,DateTime} from './common';
export const MAX_FILES=12;
export const MAX_BYTES=3*1024*1024;
export const ArtifactPath=z.string().max(240).regex(/^[a-z0-9._-]+(\/[a-z0-9._-]+)*$/).refine(p=>!p.split('/').some(s=>s==='.'||s==='..') && /\.(html|css|js|json|png|jpg|webp|svg|woff2)$/.test(p),'Invalid artifact path');
export const ArtifactFile=z.object({path:ArtifactPath,sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().nonnegative().max(MAX_BYTES)}).strict();
export const Aspect=z.enum(['9:16','free']);
export const Manifest=z.object({schema:z.literal(1),title:z.string().min(1).max(200),summary:z.string().min(1).max(1000),entry:z.literal('index.html'),poster:z.literal('poster.png'),aspect:Aspect,durationHintMs:z.number().int().min(1).max(120000),files:z.array(ArtifactFile).min(2).max(MAX_FILES),generator:z.object({runId:Id,modelId:z.string().min(1).max(200)}).strict()}).strict().superRefine((m,c)=>{
const paths=m.files.map(f=>f.path);
if(new Set(paths).size!==paths.length)c.addIssue({code:'custom',message:'Duplicate paths'});
if(!paths.includes(m.entry)||!paths.includes(m.poster))c.addIssue({code:'custom',message:'Missing entry or poster'});
if(m.files.reduce((s,f)=>s+f.bytes,0)>MAX_BYTES)c.addIssue({code:'custom',message:'Total artifact too large'});
});
export const FeedItem=z.object({vistaId:Id,channelId:Id,channelTitle:z.string(),title:z.string(),summary:z.string(),posterUrl:z.url(),aspect:Aspect,createdAt:DateTime}).strict();
export const VistaResponse=z.object({vistaId:Id,title:z.string(),summary:z.string(),aspect:Aspect,playUrl:z.url(),posterUrl:z.url(),expiresAt:DateTime}).strict();
export const HostMessage=z.object({type:z.enum(['campsite:play','campsite:pause','campsite:restart'])}).strict();
export const ReadyMessage=z.object({type:z.literal('campsite:ready'),durationMs:z.number().nonnegative().max(120000).optional()}).strict();
export type VistaManifest=z.infer<typeof Manifest>;
