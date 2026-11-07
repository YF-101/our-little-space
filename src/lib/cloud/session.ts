export type CloudSession = { user: { id: string; email?: string } };
// 用户标识是不可解释的字符串，禁止将大整数 subject 转为 JS Number。
export function normalizeCloudSession(value: unknown): CloudSession | null {
  if (value == null) return null;
  if (typeof value !== 'object' || !('user' in value) || !value.user || typeof value.user !== 'object' || !('id' in value.user) || typeof value.user.id !== 'string' || !value.user.id.trim()) throw new Error('登录身份格式无效，请重新登录');
  const user = value.user;
  return {user: {id: user.id as string, ...('email' in user && typeof user.email === 'string' ? {email:user.email} : {})}};
}
export function normalizeCloudSessionResult(result:{data?:{session?:unknown}|null;error?:unknown}) {
  const session = normalizeCloudSession(result.data?.session);
  const error = result.error ?? null;
  const emptyCredentials = !session && typeof error === "object" && error !== null && "message" in error && error.message === "credentials not found";
  return {data:{session},error:emptyCredentials ? null : error};
}
