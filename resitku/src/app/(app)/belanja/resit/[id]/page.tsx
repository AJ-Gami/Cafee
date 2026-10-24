import type { Metadata } from "next";
import { Suspense } from "react";
import { ReceiptReview } from "./ReceiptReview";

export const metadata: Metadata = { title: "Semak resit" };

export default async function ReceiptPage({ params }: PageProps<"/belanja/resit/[id]">) {
  const { id } = await params;
  return (
    <Suspense>
      <ReceiptReview id={id} />
    </Suspense>
  );
}
