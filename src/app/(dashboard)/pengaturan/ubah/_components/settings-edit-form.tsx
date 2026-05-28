"use client"

import { useRouter } from "next/navigation"
import { useTransition, useState, useRef } from "react"
import { Tabs, Input, Label, Switch, Select, ComboBox, ListBox, TextArea } from "@heroui/react"
import { CurrencyInput } from "@/components/ui/currency-input"
import { AddressPicker } from "@/components/ui/address-picker"
import { AppDatePicker } from "@/components/ui/date-picker"
import { updateSystemSettings } from "@/actions/settings.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/page-header"
import { SafeImage } from "@/components/ui/safe-image"

interface Account {
  id: number
  code: string
  name: string
}

interface SettingsEditFormProps {
  settings: SettingsFormValues
  accounts: Account[]
}

interface SettingsFormValues {
  assetPrefix?: string | null
  attendanceRadiusKm?: number | null
  cashBankAccountId?: number | null
  cogsAccountId?: number | null
  companyAddress?: string | null
  companyCity?: string | null
  companyDistrict?: string | null
  companyEmail?: string | null
  companyLatitude?: number | null
  companyLogo?: string | null
  companyLongitude?: number | null
  companyName?: string | null
  companyPhone?: string | null
  companyPostalCode?: string | null
  companyProvince?: string | null
  companyTaxId?: string | null
  companyVillage?: string | null
  companyWebsite?: string | null
  costingMethod?: string | null
  currencyCode?: string | null
  currencyLocale?: string | null
  currencySymbol?: string | null
  customerCodePrefix?: string | null
  defaultCashAccountId?: number | null
  deliveryOrderPrefix?: string | null
  documentNumberFormat?: string | null
  downPaymentPrefix?: string | null
  employeeCodePrefix?: string | null
  employeeReceivableAccountId?: number | null
  enableAutoCustomerCode?: boolean | null
  enableAutoEmployeeCode?: boolean | null
  enableAutoItemCode?: boolean | null
  enableAutoRackCode?: boolean | null
  enableAutoRowCode?: boolean | null
  enableAutoVendorCode?: boolean | null
  enableAutoWarehouseCode?: boolean | null
  expensePrefix?: string | null
  fiscalYearStartMonth?: number | null
  generalExpenseAccountId?: number | null
  goodsReceiptPrefix?: string | null
  inventoryAccountId?: number | null
  inventoryAdjustmentAccountId?: number | null
  inventoryTransferPrefix?: string | null
  itemCodePrefix?: string | null
  journalPrefix?: string | null
  latePenaltyPerMinute?: number | null
  leadPrefix?: string | null
  manufacturingOrderPrefix?: string | null
  materialExpenseAccountId?: number | null
  materialIssueExpenseAccountId?: number | null
  materialIssuePrefix?: string | null
  maxLatePenaltyMinutes?: number | null
  overtimeCoefficient?: number | null
  overtimeMealBreakEnd?: string | null
  overtimeMealBreakStart?: string | null
  overtimeMultiplier?: number | null
  payrollBankAccountId?: number | null
  payrollJournalTypeId?: number | null
  payrollPrefix?: string | null
  periodLockDate?: string | null
  pettyCashAccountId?: number | null
  pettyCashPrefix?: string | null
  projectPrefix?: string | null
  purchaseDiscountAccountId?: number | null
  purchaseExpenseAccountId?: number | null
  purchaseInventoryAccountId?: number | null
  purchaseOrderPrefix?: string | null
  purchasePayableAccountId?: number | null
  purchaseRequestPrefix?: string | null
  purchaseReturnAccountId?: number | null
  purchaseReturnPrefix?: string | null
  purchaseShippingAccountId?: number | null
  purchaseTaxAccountId?: number | null
  quotationCodePrefix?: string | null
  quotationFooterNotes?: string | null
  quotationSignatureImage?: string | null
  quotationSignatureName?: string | null
  rackCodePrefix?: string | null
  reconciliationPrefix?: string | null
  rowCodePrefix?: string | null
  salariesPayableAccountId?: number | null
  salaryExpenseAccountId?: number | null
  salesAccountId?: number | null
  salesInvoicePrefix?: string | null
  salesOrderPrefix?: string | null
  salesPaymentPrefix?: string | null
  salesReceivableAccountId?: number | null
  salesReturnAccountId?: number | null
  salesReturnPrefix?: string | null
  salesRevenueAccountId?: number | null
  salesTaxAccountId?: number | null
  showIsActiveField?: boolean | null
  showTaxId?: boolean | null
  stockAdjustmentAccountId?: number | null
  stockAdjustmentPrefix?: string | null
  stockMovementPrefix?: string | null
  ticketPrefix?: string | null
  timesheetPrefix?: string | null
  vendorBillPrefix?: string | null
  vendorCodePrefix?: string | null
  vendorPaymentPrefix?: string | null
  warehouseCodePrefix?: string | null
  wipAccountId?: number | null
  workOrderPrefix?: string | null
}

interface AccountMappingField {
  name: string
  label: string
  value: string
  onChange: (key: string) => void
}

interface AccountMappingSection {
  title: string
  items: AccountMappingField[]
}

function AccountComboBox({ name, label, accounts, value, onChange }: { name: string; label: string; accounts: Account[]; value?: string; onChange?: (key: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <ComboBox name={name} selectedKey={value || undefined} onSelectionChange={(k) => onChange?.(k ? String(k) : "")} className="w-full">
        <Label>{label}</Label>
        <ComboBox.InputGroup>
          <Input placeholder="Cari akun..." />
          <ComboBox.Trigger />
        </ComboBox.InputGroup>
        <ComboBox.Popover>
          <ListBox>
            <ListBox.Item key="" id="" textValue="-- Tidak diset --">
              -- Tidak diset --
              <ListBox.ItemIndicator />
            </ListBox.Item>
            {accounts.map((a) => (
              <ListBox.Item key={String(a.id)} id={String(a.id)} textValue={`${a.code} - ${a.name}`}>
                {a.code} - {a.name}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </ComboBox.Popover>
      </ComboBox>
    </div>
  )
}

function MappingSectionCard({ title, items, accounts }: { title: string; items: AccountMappingField[]; accounts: Account[] }) {
  const mappedCount = items.filter((item) => Boolean(item.value)).length

  return (
    <section className="rounded-xl border border-default bg-surface-secondary/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="inline-flex rounded-full border border-default bg-surface px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">
          {mappedCount}/{items.length} terisi
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <AccountComboBox
            key={item.name}
            name={item.name}
            label={item.label}
            accounts={accounts}
            value={item.value}
            onChange={item.onChange}
          />
        ))}
      </div>
    </section>
  )
}

function SettingSwitch({ name, label, defaultSelected }: { name: string; label: string; defaultSelected: boolean }) {
  const id = `${name}-switch`

  return (
    <>
      <input type="hidden" name={name} value="0" />
      <Switch id={id} name={name} value="on" defaultSelected={defaultSelected}>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.Content>
          <Label htmlFor={id} className="text-sm font-medium text-foreground">
            {label}
          </Label>
        </Switch.Content>
      </Switch>
    </>
  )
}

export function SettingsEditForm({ settings, accounts }: SettingsEditFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedTab, setSelectedTab] = useState("company")
  const [logoPreview, setLogoPreview] = useState<string | null>(settings.companyLogo || null)
  const [latitude, setLatitude] = useState(settings.companyLatitude ? String(settings.companyLatitude) : "")
  const [longitude, setLongitude] = useState(settings.companyLongitude ? String(settings.companyLongitude) : "")
  const [address, setAddress] = useState(settings.companyAddress || "")
  const [signaturePreview, setSignaturePreview] = useState<string | null>(settings.quotationSignatureImage || null)
  // Account Mapping States
  const [salesReceivable, setSalesReceivable] = useState(settings.salesReceivableAccountId ? String(settings.salesReceivableAccountId) : "")
  const [salesRevenue, setSalesRevenue] = useState(settings.salesRevenueAccountId ? String(settings.salesRevenueAccountId) : "")
  const [salesTax, setSalesTax] = useState(settings.salesTaxAccountId ? String(settings.salesTaxAccountId) : "")
  const [salesReturn, setSalesReturn] = useState(settings.salesReturnAccountId ? String(settings.salesReturnAccountId) : "")
  const [salesAcc, setSalesAcc] = useState(settings.salesAccountId ? String(settings.salesAccountId) : "")
  
  const [purchasePayable, setPurchasePayable] = useState(settings.purchasePayableAccountId ? String(settings.purchasePayableAccountId) : "")
  const [purchaseInventory, setPurchaseInventory] = useState(settings.purchaseInventoryAccountId ? String(settings.purchaseInventoryAccountId) : "")
  const [purchaseTax, setPurchaseTax] = useState(settings.purchaseTaxAccountId ? String(settings.purchaseTaxAccountId) : "")
  const [purchaseExpense, setPurchaseExpense] = useState(settings.purchaseExpenseAccountId ? String(settings.purchaseExpenseAccountId) : "")
  const [purchaseDiscount, setPurchaseDiscount] = useState(settings.purchaseDiscountAccountId ? String(settings.purchaseDiscountAccountId) : "")
  const [purchaseShipping, setPurchaseShipping] = useState(settings.purchaseShippingAccountId ? String(settings.purchaseShippingAccountId) : "")
  const [purchaseReturn, setPurchaseReturn] = useState(settings.purchaseReturnAccountId ? String(settings.purchaseReturnAccountId) : "")
  
  const [inventoryAcc, setInventoryAcc] = useState(settings.inventoryAccountId ? String(settings.inventoryAccountId) : "")
  const [inventoryAdjustment, setInventoryAdjustment] = useState(settings.inventoryAdjustmentAccountId ? String(settings.inventoryAdjustmentAccountId) : "")
  const [stockAdjustmentAcc, setStockAdjustmentAcc] = useState(settings.stockAdjustmentAccountId ? String(settings.stockAdjustmentAccountId) : "")
  const [cogsAcc, setCogsAcc] = useState(settings.cogsAccountId ? String(settings.cogsAccountId) : "")
  const [wipAcc, setWipAcc] = useState(settings.wipAccountId ? String(settings.wipAccountId) : "")
  const [materialExpense, setMaterialExpense] = useState(settings.materialExpenseAccountId ? String(settings.materialExpenseAccountId) : "")
  const [materialIssueExpense, setMaterialIssueExpense] = useState(settings.materialIssueExpenseAccountId ? String(settings.materialIssueExpenseAccountId) : "")
  
  const [pettyCashAcc, setPettyCashAcc] = useState(settings.pettyCashAccountId ? String(settings.pettyCashAccountId) : "")
  const [cashBankAcc, setCashBankAcc] = useState(settings.cashBankAccountId ? String(settings.cashBankAccountId) : "")
  const [generalExpense, setGeneralExpense] = useState(settings.generalExpenseAccountId ? String(settings.generalExpenseAccountId) : "")
  const [defaultCash, setDefaultCash] = useState(settings.defaultCashAccountId ? String(settings.defaultCashAccountId) : "")
  
  const [salaryExpense, setSalaryExpense] = useState(settings.salaryExpenseAccountId ? String(settings.salaryExpenseAccountId) : "")
  const [salariesPayable, setSalariesPayable] = useState(settings.salariesPayableAccountId ? String(settings.salariesPayableAccountId) : "")
  const [payrollBank, setPayrollBank] = useState(settings.payrollBankAccountId ? String(settings.payrollBankAccountId) : "")
  const [employeeReceivable, setEmployeeReceivable] = useState(settings.employeeReceivableAccountId ? String(settings.employeeReceivableAccountId) : "")
  const [payrollJournalType, setPayrollJournalType] = useState(settings.payrollJournalTypeId ? String(settings.payrollJournalTypeId) : "")
  const logoInputRef = useRef<HTMLInputElement>(null)
  const signatureInputRef = useRef<HTMLInputElement>(null)

  const mappingSections: AccountMappingSection[] = [
    {
      title: "Penjualan",
      items: [
        { name: "salesReceivableAccountId", label: "Piutang Usaha", value: salesReceivable, onChange: setSalesReceivable },
        { name: "salesRevenueAccountId", label: "Pendapatan Penjualan", value: salesRevenue, onChange: setSalesRevenue },
        { name: "salesTaxAccountId", label: "PPN Keluaran", value: salesTax, onChange: setSalesTax },
        { name: "salesReturnAccountId", label: "Retur Penjualan", value: salesReturn, onChange: setSalesReturn },
        { name: "salesAccountId", label: "Akun Penjualan", value: salesAcc, onChange: setSalesAcc },
      ],
    },
    {
      title: "Pembelian",
      items: [
        { name: "purchasePayableAccountId", label: "Hutang Usaha", value: purchasePayable, onChange: setPurchasePayable },
        { name: "purchaseInventoryAccountId", label: "Persediaan (Pembelian)", value: purchaseInventory, onChange: setPurchaseInventory },
        { name: "purchaseTaxAccountId", label: "PPN Masukan", value: purchaseTax, onChange: setPurchaseTax },
        { name: "purchaseExpenseAccountId", label: "Beban Pembelian", value: purchaseExpense, onChange: setPurchaseExpense },
        { name: "purchaseDiscountAccountId", label: "Diskon Pembelian", value: purchaseDiscount, onChange: setPurchaseDiscount },
        { name: "purchaseShippingAccountId", label: "Ongkos Kirim", value: purchaseShipping, onChange: setPurchaseShipping },
        { name: "purchaseReturnAccountId", label: "Retur Pembelian", value: purchaseReturn, onChange: setPurchaseReturn },
      ],
    },
    {
      title: "Persediaan & Manufaktur",
      items: [
        { name: "inventoryAccountId", label: "Persediaan", value: inventoryAcc, onChange: setInventoryAcc },
        { name: "inventoryAdjustmentAccountId", label: "Penyesuaian Persediaan", value: inventoryAdjustment, onChange: setInventoryAdjustment },
        { name: "stockAdjustmentAccountId", label: "Stock Adjustment", value: stockAdjustmentAcc, onChange: setStockAdjustmentAcc },
        { name: "cogsAccountId", label: "HPP (COGS)", value: cogsAcc, onChange: setCogsAcc },
        { name: "wipAccountId", label: "WIP", value: wipAcc, onChange: setWipAcc },
        { name: "materialExpenseAccountId", label: "Beban Material", value: materialExpense, onChange: setMaterialExpense },
        { name: "materialIssueExpenseAccountId", label: "Beban Pengeluaran Material", value: materialIssueExpense, onChange: setMaterialIssueExpense },
      ],
    },
    {
      title: "Umum",
      items: [
        { name: "pettyCashAccountId", label: "Kas Kecil", value: pettyCashAcc, onChange: setPettyCashAcc },
        { name: "cashBankAccountId", label: "Kas & Bank", value: cashBankAcc, onChange: setCashBankAcc },
        { name: "generalExpenseAccountId", label: "Beban Umum", value: generalExpense, onChange: setGeneralExpense },
        { name: "defaultCashAccountId", label: "Kas Default", value: defaultCash, onChange: setDefaultCash },
      ],
    },
    {
      title: "Payroll",
      items: [
        { name: "salaryExpenseAccountId", label: "Beban Gaji", value: salaryExpense, onChange: setSalaryExpense },
        { name: "salariesPayableAccountId", label: "Hutang Gaji", value: salariesPayable, onChange: setSalariesPayable },
        { name: "payrollBankAccountId", label: "Bank Payroll", value: payrollBank, onChange: setPayrollBank },
        { name: "employeeReceivableAccountId", label: "Piutang Karyawan", value: employeeReceivable, onChange: setEmployeeReceivable },
        { name: "payrollJournalTypeId", label: "Tipe Jurnal Payroll", value: payrollJournalType, onChange: setPayrollJournalType },
      ],
    },
  ]

  const allMappingItems = mappingSections.flatMap((section) => section.items)
  const mappedCount = allMappingItems.filter((item) => Boolean(item.value)).length
  const totalCount = allMappingItems.length
  const unmappedCount = totalCount - mappedCount
  const mappingProgress = totalCount > 0 ? Math.round((mappedCount / totalCount) * 100) : 0

  const handleAutoMap = () => {
    const findAccount = (keywords: string[]) => {
      const match = accounts.find(a => {
        const name = a.name.toLowerCase();
        const code = a.code.toLowerCase();
        return keywords.some(k => name.includes(k) || code.includes(k));
      });
      return match ? String(match.id) : "";
    };

    setSalesReceivable(findAccount(["piutang usaha", "piutang dagang", "receivable"]));
    setSalesRevenue(findAccount(["pendapatan penjualan", "revenue", "penjualan"]));
    setSalesTax(findAccount(["ppn keluaran", "ppn keluar", "tax out"]));
    setSalesReturn(findAccount(["retur penjualan", "sales return"]));
    setSalesAcc(findAccount(["akun penjualan", "sales account"]));

    setPurchasePayable(findAccount(["hutang usaha", "hutang dagang", "payable", "utang usaha"]));
    setPurchaseInventory(findAccount(["persediaan", "inventory"]));
    setPurchaseTax(findAccount(["ppn masukan", "ppn masuk", "tax in"]));
    setPurchaseExpense(findAccount(["beban pembelian", "purchase expense"]));
    setPurchaseDiscount(findAccount(["diskon pembelian", "purchase discount"]));
    setPurchaseShipping(findAccount(["ongkos kirim", "ongkir", "shipping"]));
    setPurchaseReturn(findAccount(["retur pembelian", "purchase return"]));

    setInventoryAcc(findAccount(["persediaan barang", "persediaan", "inventory"]));
    setInventoryAdjustment(findAccount(["penyesuaian persediaan", "inventory adjustment"]));
    setStockAdjustmentAcc(findAccount(["penyesuaian stok", "stock adjustment"]));
    setCogsAcc(findAccount(["hpp", "harga pokok", "cogs"]));
    setWipAcc(findAccount(["wip", "barang dalam proses", "work in progress"]));
    setMaterialExpense(findAccount(["beban material", "material expense"]));
    setMaterialIssueExpense(findAccount(["beban pengeluaran material", "material issue"]));

    setPettyCashAcc(findAccount(["kas kecil", "petty cash"]));
    setCashBankAcc(findAccount(["kas bank", "kas/bank", "bank"]));
    setGeneralExpense(findAccount(["beban umum", "general expense"]));
    setDefaultCash(findAccount(["kas default", "kas utama", "kas"]));

    setSalaryExpense(findAccount(["beban gaji", "salary expense"]));
    setSalariesPayable(findAccount(["hutang gaji", "salaries payable", "utang gaji"]));
    setPayrollBank(findAccount(["bank payroll", "payroll bank"]));
    setEmployeeReceivable(findAccount(["piutang karyawan", "employee receivable"]));
    setPayrollJournalType(findAccount(["jurnal payroll", "payroll journal"]));
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert("Browser kamu tidak mendukung geolocation");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setLatitude(String(lat));
        setLongitude(String(lon));
        
        // Reverse Geocoding via OpenStreetMap (Nominatim)
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'id' } // Force Indonesian
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.display_name) {
              // Extract street name or use full display name
              const road = data.address.road || data.address.pedestrian || data.address.path || data.address.suburb || "";
              const house_number = data.address.house_number || "";
              const streetAddress = road ? `${road} ${house_number}`.trim() : data.display_name;
              
              setAddress(streetAddress);
            }
          }
        } catch (error) {
          console.error("Gagal get address dari koordinat", error);
        }
      },
      (err) => {
        alert("Gagal mengambil lokasi: " + err.message);
      }
    );
  };

  async function uploadFile(file: File, endpoint: string): Promise<string | null> {
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch(endpoint, { method: "POST", body: formData })
      if (!res.ok) return null
      const data = await res.json()
      return data.url || data.path || null
    } catch {
      return null
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await uploadFile(file, "/api/upload/avatar")
    if (url) setLogoPreview(url)
  }

  async function handleSignatureChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = await uploadFile(file, "/api/upload/avatar")
    if (url) setSignaturePreview(url)
  }

  function isRedirectError(error: unknown): error is { digest: string } {
    return typeof error === "object"
      && error !== null
      && "digest" in error
      && typeof (error as { digest?: unknown }).digest === "string"
      && (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        if (logoPreview) formData.set("companyLogo", logoPreview)
        if (signaturePreview) formData.set("quotationSignatureImage", signaturePreview)
        await updateSystemSettings(formData)
        showSuccess("Settings berhasil disimpan")
      } catch (error: unknown) {
        // Next.js redirect throws NEXT_REDIRECT — let it propagate
        if (isRedirectError(error)) throw error
        showError(error instanceof Error ? error.message : "Gagal menyimpan settings")
      }
    })
  }

  const inputClass = "w-full rounded-lg border border-default bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"

  return (
    <form onSubmit={onSubmit}>
      <Tabs selectedKey={selectedTab} onSelectionChange={(key) => setSelectedTab(String(key))}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Settings Tabs">
            <Tabs.Tab id="company">Perusahaan<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="general">Umum<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="prefixes">Prefix Kode Otomatis<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="overtime">Lembur & Kehadiran<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="quotation">Penawaran<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="accounts">Mapping Akun<Tabs.Indicator /></Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        {/* Tab 1: Perusahaan */}
        <Tabs.Panel id="company">
          <div className="bg-surface rounded-xl border border-default shadow-sm p-6 mt-4">
          {/* Hidden inputs to pass data */}
            <input type="hidden" name="salesReceivableAccountId" value={salesReceivable} />
            <input type="hidden" name="salesRevenueAccountId" value={salesRevenue} />
            <input type="hidden" name="salesTaxAccountId" value={salesTax} />
            <input type="hidden" name="salesReturnAccountId" value={salesReturn} />
            <input type="hidden" name="salesAccountId" value={salesAcc} />
            
            <input type="hidden" name="purchasePayableAccountId" value={purchasePayable} />
            <input type="hidden" name="purchaseInventoryAccountId" value={purchaseInventory} />
            <input type="hidden" name="purchaseTaxAccountId" value={purchaseTax} />
            <input type="hidden" name="purchaseExpenseAccountId" value={purchaseExpense} />
            <input type="hidden" name="purchaseDiscountAccountId" value={purchaseDiscount} />
            <input type="hidden" name="purchaseShippingAccountId" value={purchaseShipping} />
            <input type="hidden" name="purchaseReturnAccountId" value={purchaseReturn} />
            
            <input type="hidden" name="inventoryAccountId" value={inventoryAcc} />
            <input type="hidden" name="inventoryAdjustmentAccountId" value={inventoryAdjustment} />
            <input type="hidden" name="stockAdjustmentAccountId" value={stockAdjustmentAcc} />
            <input type="hidden" name="cogsAccountId" value={cogsAcc} />
            <input type="hidden" name="wipAccountId" value={wipAcc} />
            <input type="hidden" name="materialExpenseAccountId" value={materialExpense} />
            <input type="hidden" name="materialIssueExpenseAccountId" value={materialIssueExpense} />
            
            <input type="hidden" name="pettyCashAccountId" value={pettyCashAcc} />
            <input type="hidden" name="cashBankAccountId" value={cashBankAcc} />
            <input type="hidden" name="generalExpenseAccountId" value={generalExpense} />
            <input type="hidden" name="defaultCashAccountId" value={defaultCash} />
            
            <input type="hidden" name="salaryExpenseAccountId" value={salaryExpense} />
            <input type="hidden" name="salariesPayableAccountId" value={salariesPayable} />
            <input type="hidden" name="payrollBankAccountId" value={payrollBank} />
            <input type="hidden" name="employeeReceivableAccountId" value={employeeReceivable} />
            <input type="hidden" name="payrollJournalTypeId" value={payrollJournalType} />
            <h2 className="text-base font-semibold text-foreground mb-4">Informasi Perusahaan</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="companyName">Nama Perusahaan</Label>
                <Input id="companyName" name="companyName" placeholder="Nama perusahaan" defaultValue={settings.companyName || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="companyEmail">Email</Label>
                <Input id="companyEmail" name="companyEmail" type="email" placeholder="email@company.com" defaultValue={settings.companyEmail || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="companyPhone">Telepon</Label>
                <Input id="companyPhone" name="companyPhone" placeholder="08xx-xxxx-xxxx" defaultValue={settings.companyPhone || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="companyWebsite">Website</Label>
                <Input id="companyWebsite" name="companyWebsite" placeholder="https://..." defaultValue={settings.companyWebsite || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="companyTaxId">NPWP</Label>
                <Input id="companyTaxId" name="companyTaxId" placeholder="XX.XXX.XXX.X-XXX.XXX" defaultValue={settings.companyTaxId || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="companyAddress">Alamat</Label>
                <TextArea id="companyAddress" name="companyAddress" placeholder="Alamat lengkap" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full" />
              </div>
              <div className="col-span-full">
                <AddressPicker prefix="company"
                  defaultProvince={settings.companyProvince || ""}
                  defaultCity={settings.companyCity || ""}
                  defaultDistrict={settings.companyDistrict || ""}
                  defaultVillage={settings.companyVillage || ""}
                  defaultPostalCode={settings.companyPostalCode || ""}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-full">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="companyLatitude">Latitude</Label>
                    <button type="button" onClick={handleGetLocation} className="text-xs font-semibold text-primary hover:underline" data-print-keep>Ambil Lokasi</button>
                  </div>
                  <Input id="companyLatitude" name="companyLatitude" type="number" step="any" placeholder="-6.xxxxx" value={latitude} onChange={(e) => setLatitude((e.target as HTMLInputElement).value)} className="w-full" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="companyLongitude">Longitude</Label>
                  </div>
                  <Input id="companyLongitude" name="companyLongitude" type="number" step="any" placeholder="106.xxxxx" value={longitude} onChange={(e) => setLongitude((e.target as HTMLInputElement).value)} className="w-full" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label>Logo Perusahaan</Label>
                  <div className="flex items-center gap-4">
                    {logoPreview && (
                    <SafeImage src={logoPreview} alt="Logo" width={64} height={64} className="w-16 h-16 object-contain rounded border border-default" />
                  )}
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="text-sm" />
                </div>
                <input type="hidden" name="companyLogo" value={logoPreview || ""} />
              </div>
            </div>
          </div>
        </Tabs.Panel>

        {/* Tab 2: Umum */}
        <Tabs.Panel id="general">
          <div className="bg-surface rounded-xl border border-default shadow-sm p-6 mt-4">
            <h2 className="text-base font-semibold text-foreground mb-4">Pengaturan Umum</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="flex flex-col gap-1.5">
                <Select name="costingMethod" defaultSelectedKey={settings.costingMethod || "FIFO"} className="w-full">
                  <Label>Metode Costing</Label>
                  <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="FIFO" textValue="FIFO">FIFO<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item id="LIFO" textValue="LIFO">LIFO<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item id="Average" textValue="Average">Average<ListBox.ItemIndicator /></ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Select name="fiscalYearStartMonth" defaultSelectedKey={String(settings.fiscalYearStartMonth || 1)} className="w-full">
                  <Label>Awal Tahun Fiskal (Bulan)</Label>
                  <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {Array.from({ length: 12 }, (_, i) => (
                        <ListBox.Item key={String(i + 1)} id={String(i + 1)} textValue={String(i + 1)}>
                          {i + 1}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currencyCode">Kode Mata Uang</Label>
                <Input id="currencyCode" name="currencyCode" placeholder="IDR" defaultValue={settings.currencyCode || "IDR"} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currencySymbol">Simbol Mata Uang</Label>
                <Input id="currencySymbol" name="currencySymbol" placeholder="Rp" defaultValue={settings.currencySymbol || "Rp"} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currencyLocale">Locale Mata Uang</Label>
                <Input id="currencyLocale" name="currencyLocale" placeholder="id_ID" defaultValue={settings.currencyLocale || "id_ID"} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5 hidden">
                <Label htmlFor="documentNumberFormat">Format Nomor Dokumen (legacy)</Label>
                <Input id="documentNumberFormat" name="documentNumberFormat" placeholder="(tidak dipakai)" defaultValue={settings.documentNumberFormat || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <AppDatePicker label="Tanggal Kunci Periode" name="periodLockDate" defaultValue={settings.periodLockDate ? (typeof settings.periodLockDate === 'string' ? (settings.periodLockDate as string).split("T")[0] : (settings.periodLockDate as Date).toISOString().split("T")[0]) : ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-3 justify-end">
                <div className="flex items-center gap-3">
                  <SettingSwitch name="showIsActiveField" label="Tampilkan Field Is Active" defaultSelected={settings.showIsActiveField !== false} />
                </div>
                <div className="flex items-center gap-3">
                  <SettingSwitch name="showTaxId" label="Tampilkan NPWP" defaultSelected={settings.showTaxId !== false} />
                </div>
              </div>
            </div>
          </div>
        </Tabs.Panel>

        {/* Tab 3: Prefix Kode Otomatis */}
        <Tabs.Panel id="prefixes">
          <div className="bg-surface rounded-xl border border-default shadow-sm p-6 mt-4">
            <h2 className="text-base font-semibold text-foreground mb-4">Prefix Kode Entitas</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="itemCodePrefix">Prefix Item</Label>
                <Input id="itemCodePrefix" name="itemCodePrefix" defaultValue={settings.itemCodePrefix || ""} className="w-full" />
                <SettingSwitch name="enableAutoItemCode" label="Kode Otomatis Barang" defaultSelected={settings.enableAutoItemCode !== false} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="warehouseCodePrefix">Prefix Gudang</Label>
                <Input id="warehouseCodePrefix" name="warehouseCodePrefix" defaultValue={settings.warehouseCodePrefix || ""} className="w-full" />
                <SettingSwitch name="enableAutoWarehouseCode" label="Kode Otomatis Gudang" defaultSelected={settings.enableAutoWarehouseCode !== false} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rackCodePrefix">Prefix Rak</Label>
                <Input id="rackCodePrefix" name="rackCodePrefix" defaultValue={settings.rackCodePrefix || ""} className="w-full" />
                <SettingSwitch name="enableAutoRackCode" label="Kode Otomatis Rak" defaultSelected={settings.enableAutoRackCode !== false} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rowCodePrefix">Prefix Baris</Label>
                <Input id="rowCodePrefix" name="rowCodePrefix" defaultValue={settings.rowCodePrefix || ""} className="w-full" />
                <SettingSwitch name="enableAutoRowCode" label="Kode Otomatis Baris" defaultSelected={settings.enableAutoRowCode !== false} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customerCodePrefix">Prefix Customer</Label>
                <Input id="customerCodePrefix" name="customerCodePrefix" defaultValue={settings.customerCodePrefix || ""} className="w-full" />
                <SettingSwitch name="enableAutoCustomerCode" label="Kode Otomatis Pelanggan" defaultSelected={settings.enableAutoCustomerCode !== false} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="employeeCodePrefix">Prefix Karyawan</Label>
                <Input id="employeeCodePrefix" name="employeeCodePrefix" defaultValue={settings.employeeCodePrefix || ""} className="w-full" />
                <SettingSwitch name="enableAutoEmployeeCode" label="Kode Otomatis Karyawan" defaultSelected={settings.enableAutoEmployeeCode !== false} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vendorCodePrefix">Prefix Vendor</Label>
                <Input id="vendorCodePrefix" name="vendorCodePrefix" defaultValue={settings.vendorCodePrefix || ""} className="w-full" />
                <SettingSwitch name="enableAutoVendorCode" label="Kode Otomatis Pemasok" defaultSelected={settings.enableAutoVendorCode !== false} />
              </div>
            </div>

            <h2 className="text-base font-semibold text-foreground mb-4 mt-8">Prefix Dokumen</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="quotationCodePrefix">Penawaran</Label>
                <Input id="quotationCodePrefix" name="quotationCodePrefix" defaultValue={settings.quotationCodePrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="assetPrefix">Aset</Label>
                <Input id="assetPrefix" name="assetPrefix" defaultValue={settings.assetPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="salesOrderPrefix">Pesanan Penjualan</Label>
                <Input id="salesOrderPrefix" name="salesOrderPrefix" defaultValue={settings.salesOrderPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="salesInvoicePrefix">Faktur</Label>
                <Input id="salesInvoicePrefix" name="salesInvoicePrefix" defaultValue={settings.salesInvoicePrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="salesPaymentPrefix">Pembayaran</Label>
                <Input id="salesPaymentPrefix" name="salesPaymentPrefix" defaultValue={settings.salesPaymentPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="salesReturnPrefix">Retur Penjualan</Label>
                <Input id="salesReturnPrefix" name="salesReturnPrefix" defaultValue={settings.salesReturnPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="purchaseRequestPrefix">Permintaan Pembelian</Label>
                <Input id="purchaseRequestPrefix" name="purchaseRequestPrefix" defaultValue={settings.purchaseRequestPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="purchaseOrderPrefix">Pesanan Pembelian</Label>
                <Input id="purchaseOrderPrefix" name="purchaseOrderPrefix" defaultValue={settings.purchaseOrderPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inventoryTransferPrefix">Transfer</Label>
                <Input id="inventoryTransferPrefix" name="inventoryTransferPrefix" defaultValue={settings.inventoryTransferPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="stockAdjustmentPrefix">Adjustment</Label>
                <Input id="stockAdjustmentPrefix" name="stockAdjustmentPrefix" defaultValue={settings.stockAdjustmentPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="workOrderPrefix">Perintah Kerja</Label>
                <Input id="workOrderPrefix" name="workOrderPrefix" defaultValue={settings.workOrderPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="timesheetPrefix">Timesheet</Label>
                <Input id="timesheetPrefix" name="timesheetPrefix" defaultValue={settings.timesheetPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="downPaymentPrefix">Uang Muka</Label>
                <Input id="downPaymentPrefix" name="downPaymentPrefix" defaultValue={settings.downPaymentPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deliveryOrderPrefix">Surat Jalan</Label>
                <Input id="deliveryOrderPrefix" name="deliveryOrderPrefix" defaultValue={settings.deliveryOrderPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="journalPrefix">Jurnal</Label>
                <Input id="journalPrefix" name="journalPrefix" defaultValue={settings.journalPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expensePrefix">Biaya</Label>
                <Input id="expensePrefix" name="expensePrefix" defaultValue={settings.expensePrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pettyCashPrefix">Kas Kecil</Label>
                <Input id="pettyCashPrefix" name="pettyCashPrefix" defaultValue={settings.pettyCashPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reconciliationPrefix">Rekonsiliasi</Label>
                <Input id="reconciliationPrefix" name="reconciliationPrefix" defaultValue={settings.reconciliationPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="payrollPrefix">Penggajian</Label>
                <Input id="payrollPrefix" name="payrollPrefix" defaultValue={settings.payrollPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="projectPrefix">Proyek</Label>
                <Input id="projectPrefix" name="projectPrefix" defaultValue={settings.projectPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="goodsReceiptPrefix">Penerimaan Barang</Label>
                <Input id="goodsReceiptPrefix" name="goodsReceiptPrefix" defaultValue={settings.goodsReceiptPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vendorBillPrefix">Tagihan Vendor</Label>
                <Input id="vendorBillPrefix" name="vendorBillPrefix" defaultValue={settings.vendorBillPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vendorPaymentPrefix">Pembayaran Vendor</Label>
                <Input id="vendorPaymentPrefix" name="vendorPaymentPrefix" defaultValue={settings.vendorPaymentPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="purchaseReturnPrefix">Retur Pembelian</Label>
                <Input id="purchaseReturnPrefix" name="purchaseReturnPrefix" defaultValue={settings.purchaseReturnPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ticketPrefix">Ticket / CRM</Label>
                <Input id="ticketPrefix" name="ticketPrefix" defaultValue={settings.ticketPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="leadPrefix">Prospek</Label>
                <Input id="leadPrefix" name="leadPrefix" defaultValue={settings.leadPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="materialIssuePrefix">Pengeluaran Material</Label>
                <Input id="materialIssuePrefix" name="materialIssuePrefix" defaultValue={settings.materialIssuePrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="manufacturingOrderPrefix">Perintah Produksi</Label>
                <Input id="manufacturingOrderPrefix" name="manufacturingOrderPrefix" defaultValue={settings.manufacturingOrderPrefix || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="stockMovementPrefix">Pergerakan Stok</Label>
                <Input id="stockMovementPrefix" name="stockMovementPrefix" defaultValue={settings.stockMovementPrefix || ""} className="w-full" />
              </div>
            </div>
          </div>
        </Tabs.Panel>

        {/* Tab 4: Lembur & Kehadiran */}
        <Tabs.Panel id="overtime">
          <div className="bg-surface rounded-xl border border-default shadow-sm p-6 mt-4">
            <h2 className="text-base font-semibold text-foreground mb-4">Pengaturan Lembur</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="overtimeMultiplier">Pengali Lembur</Label>
                <Input id="overtimeMultiplier" name="overtimeMultiplier" type="number" step="any" defaultValue={String(settings.overtimeMultiplier)} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="overtimeCoefficient">Koefisien Lembur</Label>
                <Input id="overtimeCoefficient" name="overtimeCoefficient" type="number" step="any" defaultValue={String(settings.overtimeCoefficient)} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="overtimeMealBreakStart">Jam Mulai Istirahat Makan</Label>
                <Input id="overtimeMealBreakStart" name="overtimeMealBreakStart" type="time" defaultValue={settings.overtimeMealBreakStart || "17:00"} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="overtimeMealBreakEnd">Jam Selesai Istirahat Makan</Label>
                <Input id="overtimeMealBreakEnd" name="overtimeMealBreakEnd" type="time" defaultValue={settings.overtimeMealBreakEnd || "19:00"} className="w-full" />
              </div>
            </div>

            <h2 className="text-base font-semibold text-foreground mb-4 mt-8">Pengaturan Kehadiran</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="attendanceRadiusKm">Radius Kehadiran (KM)</Label>
                <Input id="attendanceRadiusKm" name="attendanceRadiusKm" type="number" step="any" defaultValue={String(settings.attendanceRadiusKm)} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Denda Keterlambatan per Menit</Label>
                <CurrencyInput name="latePenaltyPerMinute" defaultValue={settings.latePenaltyPerMinute} prefix="Rp" className={inputClass} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="maxLatePenaltyMinutes">Maks Menit Denda Terlambat</Label>
                <Input id="maxLatePenaltyMinutes" name="maxLatePenaltyMinutes" type="number" defaultValue={String(settings.maxLatePenaltyMinutes)} className="w-full" />
              </div>
            </div>
          </div>
        </Tabs.Panel>

        {/* Tab 5: Quotation */}
        <Tabs.Panel id="quotation">
          <div className="bg-surface rounded-xl border border-default shadow-sm p-6 mt-4">
            <h2 className="text-base font-semibold text-foreground mb-4">Pengaturan Quotation</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="quotationFooterNotes">Catatan Footer</Label>
                <TextArea id="quotationFooterNotes" name="quotationFooterNotes" placeholder="Catatan footer quotation..." defaultValue={settings.quotationFooterNotes || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="quotationSignatureName">Nama Tanda Tangan</Label>
                <Input id="quotationSignatureName" name="quotationSignatureName" placeholder="Nama penandatangan" defaultValue={settings.quotationSignatureName || ""} className="w-full" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Gambar Tanda Tangan</Label>
                <div className="flex items-center gap-4">
                  {signaturePreview && (
                    <SafeImage src={signaturePreview} alt="Tanda Tangan" width={96} height={48} className="w-24 h-12 object-contain rounded border border-default" />
                  )}
                  <input ref={signatureInputRef} type="file" accept="image/*" onChange={handleSignatureChange} className="text-sm" />
                </div>
                <input type="hidden" name="quotationSignatureImage" value={signaturePreview || ""} />
              </div>
            </div>
          </div>
        </Tabs.Panel>

        {/* Tab 6: Mapping Akun */}
        <Tabs.Panel id="accounts">
          <div className="bg-surface rounded-xl border border-default shadow-sm p-6 mt-4">
            <div className="mb-4 rounded-xl border border-default bg-surface-secondary/50 p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted">Kualitas Mapping</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {mappedCount}/{totalCount} akun terisi
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {unmappedCount === 0
                      ? "Semua mapping akun sudah lengkap."
                      : `${unmappedCount} akun belum dipilih. Lengkapi supaya posting jurnal lebih aman.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAutoMap}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all"
                  data-print-keep
                >
                  Auto-Map Akun
                </button>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full border border-default bg-surface">
                <div className="h-full bg-primary transition-all" style={{ width: `${mappingProgress}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              {mappingSections.map((section) => (
                <MappingSectionCard key={section.title} title={section.title} items={section.items} accounts={accounts} />
              ))}
            </div>
          </div>
        </Tabs.Panel>
      </Tabs>

      {/* Submit */}
      <div className="flex items-center gap-3 mt-6">
        <Button
          type="submit"
          isDisabled={isPending}
          className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-all"
        >
          {isPending ? "Menyimpan..." : "Simpan Settings"}
        </Button>
        <Button
          type="button"
          onPress={() => router.push("/pengaturan")}
          className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"
        >
          Batal
        </Button>
      </div>
    </form>
  )
}
