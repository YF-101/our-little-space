type Result = {error?:unknown};
type Verify = (input:{email:string;token:string})=>Promise<Result>;
export type EmailVerificationAuth = {
 getUser:()=>Promise<Result & {data?:{user?:{id:string;email?:string}|null}|null}>;
 updateUser:(input:{email:string})=>Promise<Result & {data?:{user?:unknown;verifyOtp?:Verify|null}|null}>;
};
// Only verify the current account's existing address; never bind a supplied address.
export async function beginEmailVerification(auth:EmailVerificationAuth,uid:string):Promise<(code:string)=>Promise<void>> {
 const current=await auth.getUser();
 if(current.error) throw current.error;
 const user=current.data?.user;
 if(!user || user.id!==uid) throw new Error('登录账号已变化，请刷新页面后重试。');
 const email=user.email?.trim();
 if(!email) throw new Error('当前账号没有邮箱，请联系小屋管理员配置后重试。');
 const result=await auth.updateUser({email});
 if(result.error) throw result.error;
 const verify=result.data?.verifyOtp;
 if(!verify) throw new Error('邮箱验证尚未准备好，请稍后重试或联系管理员检查邮件服务。');
 return async(code:string)=>{
  const token=code.trim();
  if(!/^\d{4,8}$/.test(token)) throw new Error('请输入邮件中的数字验证码。');
  const next=await auth.getUser();
  if(next.error) throw next.error;
  if(next.data?.user?.id!==uid || next.data.user.email?.trim()!==email) throw new Error('登录账号已变化，请刷新页面后重试。');
  const completed=await verify({email,token});
  if(completed.error) throw completed.error;
 };
}
