import {z} from 'zod/v4';
import {DateTime} from './common';
import {SemanticState} from './vista';
// Portable semantic state of a Vista for one viewer (Duo continuity, re-entry). Client-local geometry never goes here.
const StatePath=z.string().min(2).max(80).regex(/^\/[a-zA-Z0-9_]{1,40}$/).refine(p=>!['/__proto__','/constructor','/prototype'].includes(p),'reserved path');
export const StatePatchOp=z.discriminatedUnion('op',[
  z.object({op:z.literal('replace'),path:StatePath,value:z.union([z.string().max(200),z.number(),z.boolean(),z.null()])}).strict(),
  z.object({op:z.literal('add'),path:StatePath,value:z.union([z.string().max(200),z.number(),z.boolean(),z.null()])}).strict(),
  z.object({op:z.literal('remove'),path:StatePath}).strict(),
]);
export const CommitState=z.object({baseStateRevision:z.number().int().nonnegative(),idempotencyKey:z.string().min(8).max(128),patch:z.array(StatePatchOp).min(1).max(64)}).strict();
export const VistaStateResponse=z.object({stateRevision:z.number().int().nonnegative(),state:SemanticState,updatedAt:DateTime.nullable()}).strict();
export const CommitStateResponse=z.object({status:z.enum(['persisted','conflict']),stateRevision:z.number().int().nonnegative(),state:SemanticState}).strict();
