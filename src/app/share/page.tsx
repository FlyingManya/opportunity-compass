import { identity } from "@/lib/auth";
import { sharedDraft } from "@/lib/shared-links";
import ShareReceiver from "@/components/ShareReceiver";
export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";
  const draft = sharedDraft({
    url: value("url"),
    text: value("text"),
    title: value("title"),
  });
  return <ShareReceiver draft={draft} signedIn={!!(await identity())} />;
}
