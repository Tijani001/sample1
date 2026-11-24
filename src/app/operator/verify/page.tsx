import { PageHeader } from "@/components/portal/shell";
import { Verifier } from "./verifier";

export const metadata = { title: "Verify tickets" };
export default function VerifyPage() {
  return (<><PageHeader title="Verify tickets" subtitle="Scan a passenger's QR code or enter the ticket number. Each ticket can be boarded once." /><Verifier /></>);
}
