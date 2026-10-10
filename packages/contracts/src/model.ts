import {z} from 'zod/v4';
import {DateTime} from './common';
// User-owned model connection (BYOK). The key is write-only: it is encrypted at rest and never returned.
export const ModelProvider=z.literal('openrouter');
export const OpenRouterKey=z.string().trim().min(20).max(400).regex(/^sk-or-/,'OpenRouter keys start with sk-or-');
export const ConnectModel=z.object({provider:ModelProvider,apiKey:OpenRouterKey,modelId:z.string().trim().min(1).max(200).optional(),verify:z.boolean().optional()}).strict();
export const ModelConnection=z.object({provider:ModelProvider,modelId:z.string().min(1).max(200),keyHint:z.string().min(4).max(24),verifiedAt:DateTime.nullable(),connectedAt:DateTime}).strict();
export const ModelOption=z.object({id:z.string().min(1).max(200),label:z.string().min(1).max(120),tier:z.enum(['cheap','balanced','frontier'])}).strict();
export const ModelResponse=z.object({connection:ModelConnection.nullable(),options:z.array(ModelOption).min(1)}).strict();
export const DEFAULT_MODEL_OPTIONS:z.infer<typeof ModelOption>[]=[
  {id:'openrouter/auto',label:'Auto',tier:'balanced'},
  {id:'google/gemini-2.5-flash-lite',label:'Gemini Flash Lite',tier:'cheap'},
  {id:'openai/gpt-4.1-mini',label:'GPT-4.1 mini',tier:'cheap'},
  {id:'deepseek/deepseek-chat-v3.1',label:'DeepSeek V3.1',tier:'cheap'},
  {id:'anthropic/claude-sonnet-4.5',label:'Claude Sonnet 4.5',tier:'balanced'},
  {id:'anthropic/claude-opus-4.1',label:'Claude Opus 4.1',tier:'frontier'},
];
export function keyHint(key:string):string{return key.length<=8?'…':`${key.slice(0,8)}…${key.slice(-4)}`;}
