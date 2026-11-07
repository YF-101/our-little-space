// 国内静态预览仅包含本地演示；不连接旧的境外云服务。
import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    OUR_SPACE_STATIC_EXPORT: "1",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
