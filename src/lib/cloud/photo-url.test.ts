import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signedPhotoUrl} from './photo-url.ts';
test('both provider signed URL fields display private photos',()=>{
 const url='https://storage.example.test/object?token=test';
 assert.equal(signedPhotoUrl({signedUrl:url}),url);
 assert.equal(signedPhotoUrl({path:'s/u/p.jpg',fullSignedURL:url,error:null}),url);
});
test('failed or unsafe signed links remain unusable',()=>{
 for(const value of [null,{}, {signedUrl:'javascript:alert(1)'},{fullSignedURL:'https://example.test/x',error:'denied'}])assert.equal(signedPhotoUrl(value),'');
});
