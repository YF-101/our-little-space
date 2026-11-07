import Space from "@/components/space";
import CloudApp from "@/components/cloud/cloud-app";
import { cloudConfigured } from "@/lib/cloud/client";
export default function Page() {
  return cloudConfigured() ? <CloudApp /> : <Space />;
}
