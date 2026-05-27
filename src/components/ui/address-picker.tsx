"use client"

import { Button } from "@/components/ui/page-header"


import { useState, useEffect, useRef } from "react"
import { Label } from "@heroui/react"
import { ChevronDown, Search } from "lucide-react"

interface AddressOption {
  code: string
  name: string
  postalCode?: string
}

interface SearchableSelectProps {
  id: string
  name: string
  label: string
  options: AddressOption[]
  value: string
  onChange: (value: string, code: string) => void
  disabled?: boolean
  placeholder?: string
}

function SearchableSelect({ id, name, label, options, value, onChange, disabled, placeholder }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filtered = options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex flex-col gap-1.5" ref={ref}>
      <Label htmlFor={id}>{label}</Label>
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <Button
          type="button"
          id={id}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="w-full px-3 py-2.5 rounded-lg border border-default bg-surface text-sm text-left text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
        >
          <span className={value ? "text-foreground" : "text-muted"}>{value || placeholder || "Pilih..."}</span>
          <ChevronDown size={14} className="text-muted" />
        </Button>

        {isOpen && (
          <div className="absolute z-50 top-full mt-1 w-full bg-surface border border-default rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-default">
              <Search size={14} className="text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari..."
                className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted">Tidak ditemukan</div>
              ) : (
                filtered.map(o => (
                  <Button
                    key={o.code}
                    type="button"
                    onClick={() => { onChange(o.name, o.code); setIsOpen(false); setSearch("") }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-primary/10 transition-colors ${value === o.name ? "bg-primary/10 text-primary font-medium" : "text-foreground"}`}
                  >
                    {o.name}
                  </Button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface AddressPickerProps {
  prefix?: string
  defaultValues?: {
    province?: string
    city?: string
    district?: string
    village?: string
    postalCode?: string
  }
}

export function AddressPicker({ prefix = "", defaultValues }: AddressPickerProps) {
  const [provinces, setProvinces] = useState<AddressOption[]>([])
  const [regencies, setRegencies] = useState<AddressOption[]>([])
  const [districts, setDistricts] = useState<AddressOption[]>([])
  const [villages, setVillages] = useState<AddressOption[]>([])

  const [selectedProvince, setSelectedProvince] = useState(defaultValues?.province || "")
  const [selectedRegency, setSelectedRegency] = useState(defaultValues?.city || "")
  const [selectedDistrict, setSelectedDistrict] = useState(defaultValues?.district || "")
  const [selectedVillage, setSelectedVillage] = useState(defaultValues?.village || "")
  const [postalCode, setPostalCode] = useState(defaultValues?.postalCode || "")

  const [provinceCode, setProvinceCode] = useState("")
  const [regencyCode, setRegencyCode] = useState("")
  const [districtCode, setDistrictCode] = useState("")

  const fieldName = (name: string) => prefix ? `${prefix}${name.charAt(0).toUpperCase() + name.slice(1)}` : name

  // Load provinces on mount
  useEffect(() => {
    fetch("/api/address?type=provinces")
      .then(res => res.json())
      .then((data: AddressOption[]) => {
        const list = Array.isArray(data) ? data : []
        setProvinces(list)
        // Auto-resolve province code from defaultValues name
        if (defaultValues?.province && !provinceCode) {
          const match = list.find(p => p.name === defaultValues.province)
          if (match) setProvinceCode(match.code)
        }
      })
      .catch(() => {})
  }, [])

  // Load regencies when province changes
  useEffect(() => {
    if (!provinceCode) { setRegencies([]); return }
    fetch(`/api/address?type=regencies&parentCode=${provinceCode}`)
      .then(res => res.json())
      .then((data: AddressOption[]) => {
        const list = Array.isArray(data) ? data : []
        setRegencies(list)
        // Auto-resolve city code from defaultValues name
        if (defaultValues?.city && !regencyCode) {
          const match = list.find(r => r.name === defaultValues.city)
          if (match) setRegencyCode(match.code)
        }
      })
      .catch(() => {})
  }, [provinceCode])

  // Load districts when regency changes
  useEffect(() => {
    if (!regencyCode) { setDistricts([]); return }
    fetch(`/api/address?type=districts&parentCode=${regencyCode}`)
      .then(res => res.json())
      .then((data: AddressOption[]) => {
        const list = Array.isArray(data) ? data : []
        setDistricts(list)
        // Auto-resolve district code from defaultValues name
        if (defaultValues?.district && !districtCode) {
          const match = list.find(d => d.name === defaultValues.district)
          if (match) setDistrictCode(match.code)
        }
      })
      .catch(() => {})
  }, [regencyCode])

  // Load villages when district changes
  useEffect(() => {
    if (!districtCode) { setVillages([]); return }
    fetch(`/api/address?type=villages&parentCode=${districtCode}`)
      .then(res => res.json())
      .then((data: AddressOption[]) => setVillages(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [districtCode])

  // Auto-fill postal code from village data is handled in onChange below

  return (
    <>
      <SearchableSelect
        id={fieldName("province")}
        name={fieldName("province")}
        label="Provinsi"
        options={provinces}
        value={selectedProvince}
        onChange={(name, code) => {
          setSelectedProvince(name); setProvinceCode(code)
          setSelectedRegency(""); setRegencyCode("")
          setSelectedDistrict(""); setDistrictCode("")
          setSelectedVillage(""); setPostalCode("")
          setRegencies([]); setDistricts([]); setVillages([])
        }}
        placeholder="Pilih Provinsi"
      />

      <SearchableSelect
        id={fieldName("city")}
        name={fieldName("city")}
        label="Kab/Kota"
        options={regencies}
        value={selectedRegency}
        onChange={(name, code) => {
          setSelectedRegency(name); setRegencyCode(code)
          setSelectedDistrict(""); setDistrictCode("")
          setSelectedVillage(""); setPostalCode("")
          setDistricts([]); setVillages([])
        }}
        disabled={!selectedProvince}
        placeholder="Pilih Kab/Kota"
      />

      <SearchableSelect
        id={fieldName("district")}
        name={fieldName("district")}
        label="Kecamatan"
        options={districts}
        value={selectedDistrict}
        onChange={(name, code) => {
          setSelectedDistrict(name); setDistrictCode(code)
          setSelectedVillage(""); setPostalCode("")
          setVillages([])
        }}
        disabled={!selectedRegency}
        placeholder="Pilih Kecamatan"
      />

      <SearchableSelect
        id={fieldName("village")}
        name={fieldName("village")}
        label="Kelurahan/Desa"
        options={villages}
        value={selectedVillage}
        onChange={(name, code) => {
          setSelectedVillage(name)
          // Auto-fill postal code from village data
          const village = villages.find(v => v.code === code)
          if (village && village.postalCode) {
            setPostalCode(village.postalCode)
          }
        }}
        disabled={!selectedDistrict}
        placeholder="Pilih Kelurahan/Desa"
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldName("postalCode")}>Kode Pos</Label>
        <input
          type="text"
          id={fieldName("postalCode")}
          name={fieldName("postalCode")}
          value={postalCode}
          readOnly
          placeholder="Otomatis terisi"
          className="w-full px-3 py-2.5 rounded-lg border border-default bg-surface-secondary text-sm text-foreground cursor-not-allowed"
        />
      </div>
    </>
  )
}
