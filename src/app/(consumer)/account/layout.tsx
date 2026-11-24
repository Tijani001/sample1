import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server";
import { AccountNav } from "./nav";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/account");
  return (
    <div className="container-page py-6 sm:py-10">
      <div className="grid gap-8 md:grid-cols-[220px_1fr]">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
