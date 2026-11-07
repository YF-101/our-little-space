// This only validates form input. Invitation authorization remains in ols_accept_invite.
export function registrationInput(invite:string,email:string,name:string,password:string,confirmation:string) {
 if(invite && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invite)) throw new Error('邀请链接不完整，请向朋友索取完整链接。');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('请填写有效的邮箱。');
 if(!name.trim() || Array.from(name.trim()).length>16) throw new Error('昵称需要 1–16 个字。');
 if(password.length<8 || password.length>72) throw new Error('密码需要 8–72 个字符。');
 if(password!==confirmation) throw new Error('两次输入的密码不一致。');
 return {email:email.trim(),name:name.trim(),password};
}
