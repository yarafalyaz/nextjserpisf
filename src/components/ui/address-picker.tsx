"use client"

import { showError } from "@/lib/utils/toast"
import { useState, useEffect } from "react"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Combobox } from "@/components/ui/combobox"

interface Region {
  code: string
  name: string
  postalCode?: string
}

interface AddressPickerProps {
  defaultValues?: {
    province?: string
    city?: string
    district?: string
    village?: string
    postalCode?: string
  }
  defaultProvince?: string
  defaultCity?: string
  defaultDistrict?: string
  defaultVillage?: string
  defaultPostalCode?: string
  prefix?: string
}

export function AddressPicker({ defaultValues, defaultProvince, defaultCity, defaultDistrict, defaultVillage, defaultPostalCode, prefix }: AddressPickerProps) {
  const initProvince = defaultValues?.province || defaultProvince || ""
  const initCity = defaultValues?.city || defaultCity || ""
  const initDistrict = defaultValues?.district || defaultDistrict || ""
  const initVillage = defaultValues?.village || defaultVillage || ""
  const initPostalCode = defaultValues?.postalCode || defaultPostalCode || ""

  const [provinces, setProvinces] = useState<Region[]>([])
  const [cities, setCities] = useState<Region[]>([])
  const [districts, setDistricts] = useState<Region[]>([])
  const [villages, setVillages] = useState<Region[]>([])

  const [selectedProvince, setSelectedProvince] = useState(initProvince)
  const [selectedCity, setSelectedCity] = useState(initCity)
  const [selectedDistrict, setSelectedDistrict] = useState(initDistrict)
  const [selectedVillage, setSelectedVillage] = useState(initVillage)
  const [postalCode, setPostalCode] = useState(initPostalCode)

  const fieldName = (field: string) => prefix ? `${prefix}${field.charAt(0).toUpperCase() + field.slice(1)}` : field
  const idPrefix = prefix ? `${prefix}-` : ""
  const provinceCode = provinces.find((p) => p.name === selectedProvince)?.code || ""
  const cityCode = cities.find((c) => c.name === selectedCity)?.code || ""
  const districtCode = districts.find((d) => d.name === selectedDistrict)?.code || ""

  useEffect(() => {
    async function loadProvinces() {
      try {
        const res = await fetch("/api/address?tipe=provinces")
        const data = await res.json()
        setProvinces(Array.isArray(data) ? data : [])
      } catch {
        showError("Gagal memuat data provinsi", "Periksa koneksi lalu coba lagi.")
      }
    }
    void loadProvinces()
  }, [])

  useEffect(() => {
    if (!provinceCode) return
    async function loadCities() {
      try {
        const res = await fetch(`/api/address?tipe=regencies&kodeInduk=${provinceCode}`)
        const data = await res.json()
        setCities(Array.isArray(data) ? data : [])
      } catch {
        showError("Gagal memuat data kabupaten/kota", "Periksa koneksi lalu coba lagi.")
      }
    }
    void loadCities()
  }, [provinceCode])

  useEffect(() => {
    if (!cityCode) return
    async function loadDistricts() {
      try {
        const res = await fetch(`/api/address?tipe=districts&kodeInduk=${cityCode}`)
        const data = await res.json()
        setDistricts(Array.isArray(data) ? data : [])
      } catch {
        showError("Gagal memuat data kecamatan", "Periksa koneksi lalu coba lagi.")
      }
    }
    void loadDistricts()
  }, [cityCode])

  useEffect(() => {
    if (!districtCode) return
    async function loadVillages() {
      try {
        const res = await fetch(`/api/address?tipe=villages&kodeInduk=${districtCode}`)
        const data = await res.json()
        setVillages(Array.isArray(data) ? data : [])
      } catch {
        showError("Gagal memuat data kelurahan/desa", "Periksa koneksi lalu coba lagi.")
      }
    }
    void loadVillages()
  }, [districtCode])

  const toOptions = (regions: Region[], withPostal = false) =>
    regions.map((r) => ({
      value: r.name,
      label: withPostal && r.postalCode ? `${r.name} (${r.postalCode})` : r.name,
    }))

  return (
    <>
      <input type="hidden" name={fieldName("province")} value={selectedProvince} />
      <input type="hidden" name={fieldName("city")} value={selectedCity} />
      <input type="hidden" name={fieldName("district")} value={selectedDistrict} />
      <input type="hidden" name={fieldName("village")} value={selectedVillage} />
      <input type="hidden" name={fieldName("postalCode")} value={postalCode} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Provinsi */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}province-select`}>Provinsi</Label>
          <Combobox
            id={`${idPrefix}province-select`}
            options={toOptions(provinces)}
            value={selectedProvince || null}
            placeholder="Cari provinsi..."
            onChange={(key) => {
              setSelectedProvince(key || "")
              setSelectedCity("")
              setSelectedDistrict("")
              setSelectedVillage("")
              setPostalCode("")
              setCities([])
              setDistricts([])
              setVillages([])
            }}
          />
        </div>

        {/* Kota/Kabupaten */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}city-select`}>Kota/Kabupaten</Label>
          <Combobox
            id={`${idPrefix}city-select`}
            options={toOptions(cities)}
            value={selectedCity || null}
            placeholder="Cari kota..."
            disabled={!provinceCode}
            onChange={(key) => {
              setSelectedCity(key || "")
              setSelectedDistrict("")
              setSelectedVillage("")
              setPostalCode("")
              setDistricts([])
              setVillages([])
            }}
          />
        </div>

        {/* Kecamatan */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}district-select`}>Kecamatan</Label>
          <Combobox
            id={`${idPrefix}district-select`}
            options={toOptions(districts)}
            value={selectedDistrict || null}
            placeholder="Cari kecamatan..."
            disabled={!cityCode}
            onChange={(key) => {
              setSelectedDistrict(key || "")
              setSelectedVillage("")
              setPostalCode("")
              setVillages([])
            }}
          />
        </div>

        {/* Kelurahan/Desa */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}village-select`}>Kelurahan/Desa</Label>
          <Combobox
            id={`${idPrefix}village-select`}
            options={toOptions(villages, true)}
            value={selectedVillage || null}
            placeholder="Cari kelurahan..."
            disabled={!districtCode}
            onChange={(key) => {
              const name = key || ""
              setSelectedVillage(name)
              const village = villages.find(v => v.name === name)
              if (village?.postalCode) setPostalCode(village.postalCode)
            }}
          />
        </div>

        {/* Kode Pos (auto-filled) */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}postal-code`}>Kode Pos</Label>
          <Input
            id={`${idPrefix}postal-code`}
            name={fieldName("postalCode")}
            value={postalCode}
            readOnly
            placeholder="Kode pos"
            className="w-full"
          />
        </div>
      </div>
    </>
  )
}
