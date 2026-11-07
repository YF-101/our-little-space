import test from 'node:test';
import assert from 'node:assert/strict';
import { beginEmailVerification } from './email-verification.ts';

test('verification is bound to the signed-in account and forwards the code to the provider', async () => {
 const sent: unknown[] = [];
 const completed: unknown[] = [];
 const auth = {
  getUser: async () => ({data:{user:{id:'2118631394489999362',email:'friend@example.com'}},error:null}),
  updateUser: async (input: unknown) => { sent.push(input); return {data:{verifyOtp:async (value:unknown)=>{completed.push(value);return {error:null};}},error:null}; },
 };
 const verify = await beginEmailVerification(auth,'2118631394489999362');
 assert.deepEqual(sent,[{email:'friend@example.com'}]);
 await verify(' 123456 ');
 assert.deepEqual(completed,[{email:'friend@example.com',token:'123456'}]);
});
test('a switched account or missing email cannot request verification',async()=>{
 let sends=0;
 for (const user of [{id:'someone-else',email:'friend@example.com'},{id:'me',email:''}]) {
  await assert.rejects(beginEmailVerification({getUser:async()=>({data:{user},error:null}),updateUser:async()=>{sends++;return {error:null};}},'me'));
 }
 assert.equal(sends,0);
});
test('provider errors and missing verification challenges do not appear successful',async()=>{
 const user={id:'me',email:'friend@example.com'};
 const denied=new Error('mail service unavailable');
 await assert.rejects(beginEmailVerification({getUser:async()=>({data:{user},error:null}),updateUser:async()=>({error:denied})},'me'),denied);
 await assert.rejects(beginEmailVerification({getUser:async()=>({data:{user},error:null}),updateUser:async()=>({error:null})},'me'));
 const verify=await beginEmailVerification({getUser:async()=>({data:{user},error:null}),updateUser:async()=>({data:{verifyOtp:async()=>({error:denied})},error:null})},'me');
 await assert.rejects(verify('123456'),denied);
});
test('invalid codes never reach the provider',async()=>{
 let calls=0;
 const verify=await beginEmailVerification({getUser:async()=>({data:{user:{id:'me',email:'friend@example.com'}},error:null}),updateUser:async()=>({data:{verifyOtp:async()=>{calls++;return {error:null};}},error:null})},'me');
 await assert.rejects(verify(''));
 await assert.rejects(verify('12345<script>'));
 assert.equal(calls,0);
});
test('switching identity after receiving a code prevents verification',async()=>{
 let active='me',calls=0;
 const verify=await beginEmailVerification({getUser:async()=>({data:{user:{id:active,email:'friend@example.com'}},error:null}),updateUser:async()=>({data:{verifyOtp:async()=>{calls++;return {error:null};}},error:null})},'me');
 active='someone-else';
 await assert.rejects(verify('123456'));
 assert.equal(calls,0);
});
