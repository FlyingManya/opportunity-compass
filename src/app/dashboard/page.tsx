import { redirect } from "next/navigation";
import { identity, publicUser } from "@/lib/auth";
import Compass from "@/components/Compass";

export default async function DashboardPage() {
  const user = await identity();
  if (!user) redirect("/");
  return <Compass initialUser={await publicUser(user)} />;
}
