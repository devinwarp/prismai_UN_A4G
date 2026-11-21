import type { Metadata } from "next";
import { loadReplays } from "@/lib/un/replay";
import ReplayView from "./ReplayView";

export const metadata: Metadata = {
  title: "Scenario replay",
  description: "Public replay of the four staged scenarios (S1-S4). Synthetic data, no login, no database.",
};

export default async function ReplayPage() {
  const kit = await loadReplays();
  return <ReplayView kit={kit} />;
}
