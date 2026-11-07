import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {getDomesticAuth,getDomesticDataClient} from "./domestic";
export const isDomesticCloud = () => Boolean(process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID);
export function cloudConfigured() {
  if (isDomesticCloud()) return true;
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
let client: SupabaseClient | undefined;
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error(
      "尚未配置 Supabase，请按接入说明填写 .env.local 并重启开发服务器。",
    );
  if (!key.startsWith("sb_publishable_"))
    throw new Error(
      "请使用 sb_publishable_ 开头的公开客户端密钥。不要填写 secret 或 service role 密钥。",
    );
  client ??= createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export function getCloudClient(): Pick<SupabaseClient,"from"|"rpc"|"storage"> {
 return isDomesticCloud() ? getDomesticDataClient() : getSupabaseClient();
}
export function getCloudAuth() {
 return isDomesticCloud() ? getDomesticAuth() : getSupabaseClient().auth;
}
