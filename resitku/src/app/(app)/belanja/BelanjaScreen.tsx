"use client";

import { Camera, FileText, HandCoins, ImageUp, PencilLine } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ExpenseDetailSheet } from "@/components/expenses/ExpenseDetailSheet";
import { ExpenseList } from "@/components/expenses/ExpenseList";
import { ExpenseSheet } from "@/components/expenses/ExpenseSheet";
import { useReceiptCapture } from "@/components/receipts/useReceiptCapture";
import { ReportView } from "@/components/reports/ReportView";
import { TaxClaimSheet } from "@/components/tax/TaxClaimSheet";
import { TaxTracker } from "@/components/tax/TaxTracker";
import { ZakatSheet } from "@/components/tax/ZakatSheet";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Fab } from "@/components/ui/Fab";
import { PageHeader } from "@/components/ui/PageHeader";
import { UnderlineTabs } from "@/components/ui/Segmented";
import { useData } from "@/hooks/useData";
import { currentMonthKL, currentYearKL } from "@/lib/format";
import { fetchExpenseCategories } from "@/lib/queries";
import { fetchTaxCategories } from "@/lib/tax";
import type { Expense, ExpenseCategory } from "@/lib/types";

type Tab = "senarai" | "laporan" | "cukai";

export function BelanjaScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "laporan" || tabParam === "cukai" ? tabParam : "senarai";
  const [year, setYear] = useState(currentYearKL());
  const [taxMenuOpen, setTaxMenuOpen] = useState(false);
  const [taxSheet, setTaxSheet] = useState<"claim" | "zakat" | null>(null);
  const { data: taxCategories } = useData(() => fetchTaxCategories(year), [year]);
  const [month, setMonth] = useState(currentMonthKL());
  const [version, setVersion] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<{ mode: "new" } | { mode: "edit"; expense: Expense } | null>(null);
  const [detail, setDetail] = useState<Expense | null>(null);
  const capture = useReceiptCapture();
  const { data: categoriesData, setData: setCategories } = useData(fetchExpenseCategories, []);
  const categories: ExpenseCategory[] = categoriesData ?? [];
  const bump = () => setVersion((v) => v + 1);

  const setTab = (t: Tab) => router.replace(t === "senarai" ? "/belanja" : `/belanja?tab=${t}`, { scroll: false });

  return (
    <main>
      <PageHeader title="Belanja" />
      <div className="px-4">
        <UnderlineTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "senarai", label: "Senarai" },
            { value: "laporan", label: "Laporan" },
            { value: "cukai", label: "Cukai" },
          ]}
        />
        <div className="pt-4">
          {tab === "senarai" ? (
            <ExpenseList
              month={month}
              onMonthChange={setMonth}
              categories={categories}
              version={version}
              onOpen={setDetail}
              onAdd={() => setMenuOpen(true)}
            />
          ) : tab === "laporan" ? (
            <ReportView month={month} onMonthChange={setMonth} categories={categories} version={version} />
          ) : (
            <TaxTracker year={year} onYearChange={setYear} version={version} onAddZakat={() => setTaxSheet("zakat")} />
          )}
        </div>
      </div>

      {tab === "cukai" ? (
        <Fab label="Tambah tuntutan" onClick={() => setTaxMenuOpen(true)} />
      ) : (
        <Fab label="Tambah belanja" onClick={() => setMenuOpen(true)} />
      )}
      <ActionMenu
        open={taxMenuOpen}
        onClose={() => setTaxMenuOpen(false)}
        title="Tambah tuntutan cukai"
        items={[
          { icon: FileText, label: "Tambah tuntutan manual", description: "Penyata premium, KWSP, SSPN, PRS…", onSelect: () => setTaxSheet("claim") },
          { icon: HandCoins, label: "Rekod zakat / fitrah", description: "Rebat cukai", onSelect: () => setTaxSheet("zakat") },
          { icon: Camera, label: "Snap resit", description: "Resit yang layak pelepasan", onSelect: capture.openCamera },
        ]}
      />
      {taxSheet === "claim" ? <TaxClaimSheet year={year} categories={taxCategories ?? []} onClose={() => setTaxSheet(null)} onSaved={bump} /> : null}
      {taxSheet === "zakat" ? <ZakatSheet onClose={() => setTaxSheet(null)} onSaved={bump} /> : null}
      {capture.element}
      <ActionMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Tambah belanja"
        items={[
          { icon: Camera, label: "Snap resit", description: "Ambil gambar, AI baca butirannya", onSelect: capture.openCamera },
          { icon: ImageUp, label: "Pilih dari galeri / PDF", description: "Gambar resit atau invois PDF", onSelect: capture.openGallery },
          { icon: PencilLine, label: "Tambah manual", description: "Isi jumlah dan kategori sendiri", onSelect: () => setSheet({ mode: "new" }) },
        ]}
      />
      {sheet ? (
        <ExpenseSheet
          open
          onClose={() => setSheet(null)}
          expense={sheet.mode === "edit" ? sheet.expense : null}
          categories={categories}
          onCategoriesChange={(list) => setCategories(() => list)}
          onSaved={bump}
        />
      ) : null}
      {detail ? (
        <ExpenseDetailSheet
          expense={detail}
          category={categories.find((c) => c.id === detail.category_id)}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setSheet({ mode: "edit", expense: detail });
            setDetail(null);
          }}
          onDeleted={bump}
        />
      ) : null}
    </main>
  );
}
