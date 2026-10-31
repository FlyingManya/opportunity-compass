import { redirect } from "next/navigation";
import { identity } from "@/lib/auth";
import Welcome from "@/components/Welcome";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ signin?: string }>;
}) {
  const user = await identity();
  if (user) redirect("/dashboard");
  return (
    <Welcome
      initialMode={(await searchParams).signin === "1" ? "login" : null}
    />
  );
}
