import {z} from 'zod/v4';
import {Id,DateTime} from './common';
export const MAX_FILES=12;
export const MAX_BYTES=3*1024*1024;
export const ArtifactPath=z.string().max(240).regex(/^[a-z0-9._-]+(\/[a-z0-9._-]+)*$/).refine(p=>!p.split('/').some(s=>s==='.'||s==='..') && /\.(html|css|js|json|png|jpg|webp|svg|woff2)$/.test(p),'Invalid artifact path');
export const ArtifactFile=z.object({path:ArtifactPath,sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().nonnegative().max(MAX_BYTES)}).strict();
export const Aspect=z.enum(['9:16','free']);
export const VistaFeature=z.enum(['motion','3d','interactive']);
export const Scene=z.object({id:z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),label:z.string().min(1).max(80),atMs:z.number().int().nonnegative().max(120000)}).strict();
export const Caption=z.object({atMs:z.number().int().nonnegative().max(120000),text:z.string().min(1).max(200)}).strict();
export const Manifest=z.object({schema:z.literal(1),title:z.string().min(1).max(200),summary:z.string().min(1).max(1000),entry:z.literal('index.html'),poster:z.literal('poster.png'),aspect:Aspect,durationHintMs:z.number().int().min(1).max(120000),files:z.array(ArtifactFile).min(2).max(MAX_FILES),generator:z.object({runId:Id,modelId:z.string().min(1).max(200)}).strict(),
  // R6.0 additive: declared capabilities and Duo companion metadata (scenes for the left pane, captions for the fold).
  features:z.array(VistaFeature).min(1).max(3).optional(),scenes:z.array(Scene).max(24).optional(),captions:z.array(Caption).max(60).optional(),sources:z.array(z.object({label:z.string().min(1).max(120),note:z.string().max(300).optional()}).strict()).max(12).optional()}).strict().superRefine((m,c)=>{
const paths=m.files.map(f=>f.path);
if(new Set(paths).size!==paths.length)c.addIssue({code:'custom',message:'Duplicate paths'});
if(!paths.includes(m.entry)||!paths.includes(m.poster))c.addIssue({code:'custom',message:'Missing entry or poster'});
if(m.files.reduce((s,f)=>s+f.bytes,0)>MAX_BYTES)c.addIssue({code:'custom',message:'Total artifact too large'});
if(m.features&&new Set(m.features).size!==m.features.length)c.addIssue({code:'custom',message:'Duplicate features'});
if(m.scenes&&new Set(m.scenes.map(s=>s.id)).size!==m.scenes.length)c.addIssue({code:'custom',message:'Duplicate scene ids'});
});
export const Origin=z.object({vistaId:Id,channelId:Id,workspaceId:Id}).strict();
export const FeedItem=z.object({vistaId:Id,revisionId:Id,channelId:Id,channelTitle:z.string(),title:z.string(),summary:z.string(),posterUrl:z.url(),aspect:Aspect,features:z.array(VistaFeature).optional(),published:z.boolean(),origin:Origin.nullable(),createdAt:DateTime}).strict();
export const VistaResponse=z.object({vistaId:Id,revisionId:Id,channelId:Id,title:z.string(),summary:z.string(),aspect:Aspect,features:z.array(VistaFeature).optional(),scenes:z.array(Scene).optional(),captions:z.array(Caption).optional(),playUrl:z.url(),posterUrl:z.url(),expiresAt:DateTime,published:z.boolean(),owned:z.boolean(),origin:Origin.nullable(),durationHintMs:z.number().int().positive()}).strict();
// Host → Vista. Opaque-origin iframe: never include secrets.
export const HostMessage=z.discriminatedUnion('type',[
  z.object({type:z.literal('campsite:play')}).strict(),
  z.object({type:z.literal('campsite:pause')}).strict(),
  z.object({type:z.literal('campsite:restart')}).strict(),
  z.object({type:z.literal('campsite:seek'),atMs:z.number().int().nonnegative().max(120000)}).strict(),
  z.object({type:z.literal('campsite:scene'),sceneId:z.string().min(1).max(64)}).strict(),
  z.object({type:z.literal('campsite:restore'),state:z.record(z.string(),z.unknown())}).strict(),
]);
// Vista → Host.
export const SemanticState=z.record(z.string().regex(/^[a-zA-Z0-9_]{1,40}$/),z.union([z.string().max(200),z.number(),z.boolean(),z.null()]));
export const ReadyMessage=z.object({type:z.literal('campsite:ready'),durationMs:z.number().nonnegative().max(120000).optional()}).strict();
export const VistaMessage=z.discriminatedUnion('type',[
  ReadyMessage,
  z.object({type:z.literal('campsite:state'),state:SemanticState}).strict(),
  z.object({type:z.literal('campsite:scene'),sceneId:z.string().min(1).max(64),atMs:z.number().int().nonnegative().max(120000).optional()}).strict(),
]);
export type VistaManifest=z.infer<typeof Manifest>;
export type SemanticStateData=z.infer<typeof SemanticState>;
// Inferred TypeScript types (same names as the schemas; value and type namespaces are separate).
export type ArtifactPath=z.infer<typeof ArtifactPath>;
export type ArtifactFile=z.infer<typeof ArtifactFile>;
export type Aspect=z.infer<typeof Aspect>;
export type VistaFeature=z.infer<typeof VistaFeature>;
export type Scene=z.infer<typeof Scene>;
export type Caption=z.infer<typeof Caption>;
export type Manifest=z.infer<typeof Manifest>;
export type Origin=z.infer<typeof Origin>;
export type FeedItem=z.infer<typeof FeedItem>;
export type VistaResponse=z.infer<typeof VistaResponse>;
export type HostMessage=z.infer<typeof HostMessage>;
export type SemanticState=z.infer<typeof SemanticState>;
export type ReadyMessage=z.infer<typeof ReadyMessage>;
export type VistaMessage=z.infer<typeof VistaMessage>;
