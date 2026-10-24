import type { Metadata } from "next";
import { Suspense } from "react";
import { BelanjaScreen } from "./BelanjaScreen";

export const metadata: Metadata = { title: "Belanja" };

export default function BelanjaPage() {
  return (
    <Suspense>
      <BelanjaScreen />
    </Suspense>
  );
}
