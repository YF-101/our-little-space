import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationInput } from './registration.ts';
const invite='3fb67cc1-a402-4ee1-bf9c-92be2cb3b776';
test('registration validates invitation and account fields before requesting mail',()=>{
 assert.deepEqual(registrationInput(invite,' friend@example.com ',' Friend ','password-123','password-123'),{email:'friend@example.com',name:'Friend',password:'password-123'});
 for(const args of [ ['invalid-link', 'friend@example.com','Friend','password-123','password-123'],[invite,'bad','Friend','password-123','password-123'],[invite,'friend@example.com',' ','password-123','password-123'],[invite,'friend@example.com','Friend','short','short'],[invite,'friend@example.com','Friend','password-123','different']])assert.throws(()=>registrationInput(...args as [string,string,string,string,string]));
});

test('a new visitor can register without an invitation',()=>{
 assert.equal(registrationInput('', 'new@example.com','新成员','password-123','password-123').email,'new@example.com');
});
