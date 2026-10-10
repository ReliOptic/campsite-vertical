import {z} from 'zod/v4';
import {mkdirSync,writeFileSync} from 'node:fs';
import * as c from '../src/index';
mkdirSync('schemas',{recursive:true});
for(const [name,schema] of Object.entries(c))if(schema instanceof z.ZodType)writeFileSync(`schemas/${name}.json`,JSON.stringify(z.toJSONSchema(schema,{unrepresentable:'any'}),null,2)+'\n');
writeFileSync('schemas/endpoints.json',JSON.stringify({version:c.CONTRACT_VERSION,endpoints:c.endpoints.map(e=>({...e,...('request' in e?{request:z.toJSONSchema(e.request,{unrepresentable:'any'})}:{}),...('response' in e?{response:z.toJSONSchema(e.response,{unrepresentable:'any'})}:{})}))},null,2)+'\n');
