import type { Metadata } from "next";
import { HutangScreen } from "./HutangScreen";

export const metadata: Metadata = { title: "Hutang" };

export default function HutangPage() {
  return <HutangScreen />;
}
