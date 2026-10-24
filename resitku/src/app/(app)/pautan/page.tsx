import type { Metadata } from "next";
import { Suspense } from "react";
import { PautanScreen } from "./PautanScreen";

export const metadata: Metadata = { title: "Pautan" };

export default function PautanPage() {
  return (
    <Suspense>
      <PautanScreen />
    </Suspense>
  );
}
