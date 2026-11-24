import { getDb, getSessionUser } from "@/lib/server";
import { ProfileForm } from "../forms";

export const metadata = { title: "Personal info" };
export default async function Profile() {
  const user = (await getSessionUser())!;
  const db = await getDb();
  const [p] = await db.query<{ home_city_id: string | null }>(`select home_city_id from user_profiles where user_id = $1`, [user.id]);
  const cities = await db.query<{ id: string; name: string }>(`select id, name from cities order by name`);
  return <div><h1 className="text-2xl font-semibold">Personal info</h1><div className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6"><ProfileForm name={user.name} phone={user.phone ?? ""} email={user.email ?? ""} homeCity={p?.home_city_id ?? ""} cities={cities} /></div></div>;
}
