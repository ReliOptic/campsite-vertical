import {z} from 'zod/v4';
import {Id,DateTime} from './common';
import {FeedItem} from './vista';
export const Publisher=z.object({workspaceId:Id,name:z.string().min(1).max(80),avatarUrl:z.url().nullable()}).strict();
// Explicit per-Vista publication (Q2). Publishing never widens the audience of other Vistas or the channel brief itself.
export const PublishResponse=z.object({vistaId:Id,publicationId:Id,publishedAt:DateTime}).strict();
export const DiscoveryItem=FeedItem.extend({publisher:Publisher,publishedAt:DateTime,subscribed:z.boolean(),forkCount:z.number().int().nonnegative()}).strict();
export const DiscoveryResponse=z.object({items:z.array(DiscoveryItem),nextCursor:z.string().nullable()}).strict();
// Cross-account subscription to a publisher's channel.
export const Subscribe=z.object({channelId:Id}).strict();
export const Subscription=z.object({channelId:Id,title:z.string(),publisher:Publisher,subscribedAt:DateTime,latestVistaId:Id.nullable(),latestPosterUrl:z.url().nullable()}).strict();
export const SubscriptionsResponse=z.object({items:z.array(Subscription)}).strict();
// Fork (Q1): copy a published Vista revision and its channel brief into the caller's workspace, preserving origin.
export const ForkRequest=z.object({vistaId:Id,rerun:z.boolean().optional()}).strict();
export const ForkResponse=z.object({channelId:Id,vistaId:Id,runId:Id.nullable()}).strict();
// Inferred TypeScript types (same names as the schemas; value and type namespaces are separate).
export type Publisher=z.infer<typeof Publisher>;
export type PublishResponse=z.infer<typeof PublishResponse>;
export type DiscoveryResponse=z.infer<typeof DiscoveryResponse>;
export type Subscribe=z.infer<typeof Subscribe>;
export type Subscription=z.infer<typeof Subscription>;
export type SubscriptionsResponse=z.infer<typeof SubscriptionsResponse>;
export type ForkRequest=z.infer<typeof ForkRequest>;
export type ForkResponse=z.infer<typeof ForkResponse>;
