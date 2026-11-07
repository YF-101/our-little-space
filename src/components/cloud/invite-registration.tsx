"use client";
import { useEffect, useState } from 'react';
import { beginDomesticRegistration } from '@/lib/cloud/domestic';
import { registrationInput } from '@/lib/cloud/registration';
import { errorText } from '@/lib/cloud/api';
export default function InviteRegistration({invite,onBack}:{invite:string;onBack:()=>void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[email,setEmail]=useState(''),[remaining,setRemaining]=useState(0);
 const [verify,setVerify]=useState<((token:string)=>Promise<void>)|null>(null);
 useEffect(()=>{if(!remaining)return;const t=setTimeout(()=>setRemaining(remaining-1),1000);return()=>clearTimeout(t);},[remaining]);
 return <section aria-label={invite ? "受邀注册" : "注册账号"}>
 <h3>{verify?'验证邮箱，完成注册':'创建你的独立账号'}</h3>
 <p>{invite ? "使用对方邀请的邮箱注册。验证后还需确认接受邀请，才能查看共享回忆。" : "验证邮箱后，你可以创建自己的双人小屋，再邀请另一人。每间小屋的内容只对其成员开放。"}</p>
 {!verify ? <form onSubmit={async e=>{
  e.preventDefault();if(busy)return;setError('');setBusy(true);
  const form=e.currentTarget;const data=new FormData(form);
  try {const input=registrationInput(invite,String(data.get('email')),String(data.get('nickname')),String(data.get('password')),String(data.get('confirmation')));
   const next=await beginDomesticRegistration(input);setEmail(input.email);setVerify(()=>next);setRemaining(60);form.reset();
  }catch(e){setError(errorText(e));}finally{setBusy(false);}
 }}>
 <label>{invite ? "受邀邮箱" : "你的邮箱"}<input name="email" type="email" autoComplete="email" required defaultValue={email}/></label>
 <label>你的昵称<input name="nickname" autoComplete="nickname" required maxLength={16}/></label>
 <label>设置密码<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72}/></label>
 <label>再次输入密码<input name="confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={72}/></label>
 <button className="primary-button" disabled={busy}>{busy?'正在发送…':'发送验证码'}</button>
 </form> : <form onSubmit={async e=>{
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{await verify(String(new FormData(e.currentTarget).get('code')).trim());}catch(e){setError(errorText(e));}finally{setBusy(false);}
 }}>
 <p role="status">验证码已请求发送至 {email}。请检查收件箱和垃圾邮件，先不要刷新此页。</p>
 <label>邮件验证码<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4,8}" required minLength={4} maxLength={8}/></label>
 <button className="primary-button" disabled={busy}>{busy?'正在验证…':'验证并继续'}</button>
 <button type="button" className="text-button" disabled={busy||remaining>0} onClick={()=>{setVerify(null);setError('');}}>{remaining?`${remaining} 秒后可重新填写发送`:'重新填写并发送验证码'}</button>
 </form>}
 {error&&<p role="alert" className="inline-error">{error}</p>}
 <p className="small muted">已有账号也可以通过邮箱验证登录，已有密码不会被此表单覆盖。注册账号不会自动加入任何小屋。</p>
 <button type="button" className="text-button" disabled={busy} onClick={onBack}>已有账号，返回登录</button>
 </section>;
}
