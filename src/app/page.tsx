import { redirect } from "next/navigation";
import { identity } from "@/lib/auth";
import Welcome from "@/components/Welcome";

export default async function Page() {
  const user = await identity();
  if (user) redirect("/dashboard");
  return <Welcome />;
}
