import { judgeLoginAvailable } from "@/lib/un/judge-login";
import LoginClient from "./LoginClient";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <LoginClient judge={judgeLoginAvailable()} judgeFailed={error === "judge"} />;
}
