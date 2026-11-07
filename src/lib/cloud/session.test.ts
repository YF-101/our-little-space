import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCloudSession} from './session.ts';
test('opaque CloudBase subject stays exact without numeric conversion',()=>{
 assert.deepEqual(normalizeCloudSession({user:{id:'2118537290455220225',email:'a@example.test'}}),{user:{id:'2118537290455220225',email:'a@example.test'}});
});
test('missing session is signed out; malformed identity is rejected',()=>{
 assert.equal(normalizeCloudSession(null),null);
 for(const value of [{user:{id:2118537290455220225}},{user:{id:''}},{user:{}}])assert.throws(()=>normalizeCloudSession(value),/身份/);
});

test('fresh browser without credentials is signed out without an error banner',async()=>{
 const {normalizeCloudSessionResult}=await import('./session.ts');
 assert.deepEqual(normalizeCloudSessionResult({data:{session:null},error:{message:'credentials not found'}}),{data:{session:null},error:null});
});
test('session lookup keeps network errors and does not erase authenticated sessions',async()=>{
 const {normalizeCloudSessionResult}=await import('./session.ts');
 const error={message:'network timeout'};
 assert.equal(normalizeCloudSessionResult({data:{session:null},error}).error,error);
 const session={user:{id:'2118631394489999362'}};
 assert.deepEqual(normalizeCloudSessionResult({data:{session}}).data.session,session);
});
