import * as w from './web';
import * as r from './runner';
import * as m from './model';
import * as s from './social';
import * as st from './state';
import {VistaResponse} from './vista';
export const endpoints=[
{method:'GET',path:'/auth/google/start',status:302},
{method:'GET',path:'/auth/google/callback',request:w.OAuthCallback,status:302},
{method:'GET',path:'/auth/options',response:w.AuthOptions,status:200},
{method:'POST',path:'/auth/dev/login',request:w.DevLogin,response:w.MeResponse,status:200,devOnly:true},
{method:'POST',path:'/auth/logout',status:204},
{method:'GET',path:'/api/me',response:w.MeResponse,status:200},
{method:'GET',path:'/api/runtime',response:w.RuntimeResponse,status:200},
{method:'GET',path:'/api/model',response:m.ModelResponse,status:200},
{method:'POST',path:'/api/model',request:m.ConnectModel,response:m.ModelResponse,status:200},
{method:'DELETE',path:'/api/model',response:m.ModelResponse,status:200},
{method:'GET',path:'/api/channels',response:w.ChannelsResponse,status:200},
{method:'POST',path:'/api/channels',request:w.CreateChannel,response:w.CreateChannelResponse,status:201,idempotency:true},
{method:'PATCH',path:'/api/channels/:id',request:w.UpdateChannel,response:w.Channel,status:200},
{method:'POST',path:'/api/runs',request:w.CreateRun,response:w.CreateRunResponse,status:202},
{method:'GET',path:'/api/runs/:id',response:w.RunResponse,status:200},
{method:'POST',path:'/api/runs/:id/cancel',response:w.RunResponse,status:200},
{method:'GET',path:'/api/feed',response:w.FeedResponse,status:200},
{method:'GET',path:'/api/discovery',response:s.DiscoveryResponse,status:200},
{method:'GET',path:'/api/vistas/:id',response:VistaResponse,status:200},
{method:'POST',path:'/api/vistas/:id/publish',response:s.PublishResponse,status:200},
{method:'DELETE',path:'/api/vistas/:id/publish',response:VistaResponse,status:200},
{method:'GET',path:'/api/vistas/:id/state',response:st.VistaStateResponse,status:200},
{method:'PUT',path:'/api/vistas/:id/state',request:st.CommitState,response:st.CommitStateResponse,status:200},
{method:'GET',path:'/api/subscriptions',response:s.SubscriptionsResponse,status:200},
{method:'POST',path:'/api/subscriptions',request:s.Subscribe,response:s.SubscriptionsResponse,status:201},
{method:'DELETE',path:'/api/subscriptions/:channelId',response:s.SubscriptionsResponse,status:200},
{method:'POST',path:'/api/forks',request:s.ForkRequest,response:s.ForkResponse,status:201},
{method:'POST',path:'/api/ask',request:w.AskRequest,response:w.AskResponse,status:200},
{method:'POST',path:'/runner/register',request:r.Register,response:r.RegisterResponse,status:200},
{method:'POST',path:'/runner/claim',request:r.Claim,response:r.Job,status:200},
{method:'POST',path:'/runner/runs/:id/heartbeat',request:r.Heartbeat,response:r.HeartbeatResponse,status:200,fencing:true},
{method:'PUT',path:'/runner/runs/:id/files/*',status:200,fencing:true},
{method:'POST',path:'/runner/runs/:id/submit',request:r.Submit,response:r.SubmitResponse,status:201,fencing:true},
{method:'POST',path:'/runner/runs/:id/fail',request:r.Fail,response:r.FailResponse,status:200,fencing:true}
] as const;
