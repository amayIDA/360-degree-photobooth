import { isConfigured } from "@/lib/supabase";

/** Shows a readable message instead of crashing when the Supabase env vars are missing. */
export default function ConfigGate({ children }: { children: React.ReactNode }) {
  if (isConfigured) return <>{children}</>;
  return (
    <div className="page">
      <div className="card boxed">
        <h1>Setup needed</h1>
        <p className="lead">
          NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing. Add them in Vercel
          (Settings, Environment Variables), then redeploy: variables are only picked up by a new build.
        </p>
      </div>
    </div>
  );
}
