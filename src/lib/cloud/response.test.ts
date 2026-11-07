import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloudbaseJsonResponse} from './response.ts';
test('decoded UUID RPC response remains valid JSON for PostgREST',async()=>{
 const id='12345678-1234-4234-8234-123456789012';
 assert.equal(await cloudbaseJsonResponse(id,200).json(),id);
});
test('row responses and errors preserve their structure and headers',async()=>{
 const rows=[{id:'2118631394489999362'}];
 const response=cloudbaseJsonResponse(rows,200,{'content-range':'0-0/1'});
 assert.deepEqual(await response.json(),rows);assert.equal(response.headers.get('content-range'),'0-0/1');
 const error={code:'42501',message:'permission denied'};
 assert.deepEqual(await cloudbaseJsonResponse(error,403).json(),error);
});
test('void success has no invalid JSON or forbidden response body',async()=>{
 assert.equal(await cloudbaseJsonResponse(undefined,204).text(),'');
 assert.equal(await cloudbaseJsonResponse(null,200).json(),null);
});
