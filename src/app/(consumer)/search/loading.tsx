import { Skeleton } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <div className="container-page py-6" aria-busy="true" aria-label="Loading trips">
      <Skeleton className="h-12 w-72" />
      <div className="mt-5 flex gap-2 overflow-hidden">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[68px] w-[92px] shrink-0 rounded-xl" />)}</div>
      <div className="mt-6 grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className="hidden space-y-3 lg:block">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-line p-5">
              <div className="flex gap-3"><Skeleton className="h-10 w-10 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="w-40" /><Skeleton className="h-3 w-56" /></div><Skeleton className="h-7 w-24" /></div>
              <Skeleton className="mt-5 h-10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
