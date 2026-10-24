import type { Metadata } from "next";
import { KenderaanScreen } from "./KenderaanScreen";

export const metadata: Metadata = { title: "Kenderaan" };

export default function KenderaanPage() {
  return <KenderaanScreen />;
}
