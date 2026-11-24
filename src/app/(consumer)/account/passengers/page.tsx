import { requireUser } from "@/lib/auth/guards";
import { Trash2, UserRound } from "lucide-react";
import { getDb } from "@/lib/server";
import { PassengerForm } from "../forms";
import { deletePassengerAction } from "../actions";
import { EmptyState } from "@/components/ui/primitives";

export const metadata = { title: "Saved passengers" };
export default async function Passengers() {
  const user = await requireUser("/account/passengers");
  const rows = await (await getDb()).query<{ id: string; full_name: string; phone: string | null; email: string | null; next_of_kin_name: string | null }>(`select id, full_name, phone, email, next_of_kin_name from saved_passengers where user_id = $1 order by created_at`, [user.id]);
  return (
    <div>
      <h1 className="text-2xl font-semibold">Saved passengers</h1>
      <p className="mt-1 text-[15px] text-ink-3">Fill in passenger details in one tap at checkout.</p>
      {rows.length === 0 ? <EmptyState className="mt-6" icon={<UserRound className="h-6 w-6" />} title="No saved passengers">Add family and colleagues you often travel with.</EmptyState> : (
        <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-white">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-sm font-semibold">{p.full_name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
              <span className="flex-1"><span className="block font-medium">{p.full_name}</span><span className="block text-[13px] text-ink-3">{[p.phone, p.email, p.next_of_kin_name && `Emergency: ${p.next_of_kin_name}`].filter(Boolean).join(" · ") || "No contact details"}</span></span>
              <form action={deletePassengerAction}><input type="hidden" name="id" value={p.id} /><button aria-label={`Remove ${p.full_name}`} className="grid h-10 w-10 place-items-center rounded-full text-ink-3 hover:bg-danger-bg hover:text-danger"><Trash2 className="h-4 w-4" /></button></form>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-8 text-lg font-semibold">Add a passenger</h2>
      <div className="mt-3 rounded-2xl border border-line bg-white p-5 sm:p-6"><PassengerForm /></div>
    </div>
  );
}
