export function signedPhotoUrl(value: unknown):string {
 if(!value || typeof value !== 'object' || ('error' in value && value.error))return '';
 const candidate = 'signedUrl' in value ? value.signedUrl : 'fullSignedURL' in value ? value.fullSignedURL : null;
 if(typeof candidate !== 'string')return '';
 try { return new URL(candidate).protocol === 'https:' ? candidate : ''; } catch { return ''; }
}
