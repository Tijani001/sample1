import { revalidatePath } from "next/cache";
import { Monitor } from "lucide-react";
import { getDb, getSessionUser } from "@/lib/server";
import { PasswordForm } from "../forms";
import { formatDate } from "@/lib/domain/time";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Security" };

async function signOutOthers() {
  "use server";
  const u = await getSessionUser();
  if (!u) return;
  const { cookies } = await import("next/headers");
  const { sha256 } = await import("@/lib/domain/ids");
  const token = (await cookies()).get("gr_session")?.value ?? "";
  await (await getDb()).query(`delete from sessions where user_id = $1 and token_hash <> $2`, [u.id, sha256(token)]);
  revalidatePath("/account/security");
}

export default async function Security() {
  const user = (await getSessionUser())!;
  const sessions = await (await getDb()).query<{ created_at: Date; user_agent: string | null }>(`select created_at, user_agent from sessions where user_id = $1 and expires_at > now() order by created_at desc`, [user.id]);
  return (
    <div>
      <h1 className="text-2xl font-semibold">Security</h1>
      <h2 className="mt-6 text-lg font-semibold">Change password</h2>
      <div className="mt-3 rounded-2xl border border-line bg-white p-5 sm:p-6"><PasswordForm /></div>
      <h2 className="mt-8 text-lg font-semibold">Signed-in devices</h2>
      <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
        {sessions.map((s, i) => <li key={i} className="flex items-center gap-3 px-4 py-3 text-[14px]"><Monitor className="h-4 w-4 text-ink-3" /><span className="flex-1 truncate">{s.user_agent?.match(/\(([^)]+)\)/)?.[1] ?? "Unknown device"}</span><span className="text-ink-3">{formatDate(s.created_at)}</span></li>)}
      </ul>
      {sessions.length > 1 && <form action={signOutOthers} className="mt-3"><Button variant="outline" size="sm">Sign out of other devices</Button></form>}
    </div>
  );
}
