import type { Metadata } from "next";
import { VehicleDetail } from "./VehicleDetail";

export const metadata: Metadata = { title: "Butiran kenderaan" };

export default async function VehiclePage({ params }: PageProps<"/kenderaan/[id]">) {
  const { id } = await params;
  return <VehicleDetail id={id} />;
}
