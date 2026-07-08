import { BillingPanel } from "@/components/enterprise/BillingPanel";

export default function EnterpriseBillingPage() {
  return (
    <>
      <div className="ent-page-head">
        <h1>{"// Cobrança"}</h1>
        <p>Plano do workspace, uso de seats e de scans do time.</p>
      </div>
      <BillingPanel />
    </>
  );
}
