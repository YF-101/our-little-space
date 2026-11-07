import cloudbase from '@cloudbase/js-sdk';
import { PostgrestClient } from '@supabase/postgrest-js';
import { cloudbaseJsonResponse } from './response';
import { beginEmailVerification } from './email-verification';
import type { SupabaseClient } from '@supabase/supabase-js';
import {normalizeCloudSession, normalizeCloudSessionResult, type CloudSession} from './session';
type CloudbaseTransport = {request:{fetch(options:RequestInit & {url:string;headers:Record<string,string>;shouldThrowOnError:boolean}):Promise<{data:unknown;statusCode?:number;header?:HeadersInit}>}};
let app: ReturnType<typeof cloudbase.init> | undefined;
function getApp() {
 const env = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
 if (!env) throw new Error('尚未配置国内云环境');
 app ??= cloudbase.init({env,region:'ap-shanghai',persistence:'local',auth:{detectSessionInUrl:false}});
 return app;
}
export function getDomesticAuth() {
 const auth=getApp().auth();
 return {
  async getSession() {
   const result=await auth.getSession();
   return normalizeCloudSessionResult(result);
  },
  onAuthStateChange(callback:(event:string,session:CloudSession|null)=>void) {
   return auth.onAuthStateChange((event,session)=>callback(event,normalizeCloudSession(session)));
  },
  async signInWithPassword(input:{email:string;password:string}) {
   return auth.signInWithPassword({username:input.email,password:input.password});
  },
  async signOut(_options?:{scope:'local'}) {
   const result = await auth.signOut();
   if (result && 'error' in result && result.error) return {error: result.error};
   return {error:null};
  },
 };
}
export function getDomesticDataClient(): Pick<SupabaseClient,'from'|'rpc'|'storage'> {
 const app=getApp();
 const endpoint=app.getEndPointWithKey('GATEWAY');
 const initialBase = `${endpoint.PROTOCOL}${endpoint.BASE_URL}`;
 const db=new PostgrestClient(`${initialBase}/rdb/rest`, {
  fetch: async (url, init) => {
   const current=app.getEndPointWithKey('GATEWAY');
   const currentBase=`${current.PROTOCOL}${current.BASE_URL}`;
   const target=String(url).startsWith(initialBase) ? String(url).replace(initialBase,currentBase) : String(url);
   const response=await (app as unknown as CloudbaseTransport).request.fetch({
    ...init,url:target,
    headers:Object.fromEntries(new Headers(init?.headers).entries()),
    shouldThrowOnError:false,
   });
   const data=await response.data;
   return cloudbaseJsonResponse(data,response.statusCode ?? 200,response.header);
  },
 });
 if (!app.storage) throw new Error('国内私有存储组件未加载');
 // 官方 SDK 的 PostgREST 与 Bucket API 对齐；版本间泛型声明不同，边界集中在这里。
 return {from:db.from.bind(db),rpc:db.rpc.bind(db),storage:app.storage} as unknown as Pick<SupabaseClient,'from'|'rpc'|'storage'>;
}

export function beginDomesticEmailVerification(uid:string) {
 return beginEmailVerification(getApp().auth(),uid);
}

export async function beginDomesticRegistration(input:{email:string;name:string;password:string}) {
 const result=await getApp().auth().signUp(input);
 if(result.error) throw result.error;
 const verify=result.data?.verifyOtp;
 if(!verify) throw new Error('注册验证尚未准备好，请稍后重试。');
 return async(token:string)=>{
  if(!/^\d{4,8}$/.test(token)) throw new Error('请输入邮件中的数字验证码。');
  const completed=await verify({token});
  if(completed.error) throw completed.error;
  if(!completed.data?.session) throw new Error('未能取得登录状态，请返回登录后重试。');
 };
}
