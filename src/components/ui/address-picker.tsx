"use client"

import { useState, useEffect } from "react"
import { ComboBox, Input, ListBox, Label } from "@heroui/react"

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
  const provinceCode = provinces.find((p) => p.name === selectedProvince)?.code || ""
  const cityCode = cities.find((c) => c.name === selectedCity)?.code || ""
  const districtCode = districts.find((d) => d.name === selectedDistrict)?.code || ""

  // Load provinces
  useEffect(() => {
    fetch("/api/address?tipe=provinces")
      .then(res => res.json())
      .then(data => setProvinces(data))
      .catch(() => {})
  }, [])

  // Load cities
  useEffect(() => {
    if (!provinceCode) return
    fetch(`/api/address?tipe=regencies&parentCode=${provinceCode}`)
      .then(res => res.json())
      .then(data => setCities(data))
      .catch(() => {})
  }, [provinceCode])

  // Load districts
  useEffect(() => {
    if (!cityCode) return
    fetch(`/api/address?tipe=districts&parentCode=${cityCode}`)
      .then(res => res.json())
      .then(data => setDistricts(data))
      .catch(() => {})
  }, [cityCode])

  // Load villages
  useEffect(() => {
    if (!districtCode) return
    fetch(`/api/address?tipe=villages&parentCode=${districtCode}`)
      .then(res => res.json())
      .then(data => setVillages(data))
      .catch(() => {})
  }, [districtCode])

  return (
    <>
      <input type="hidden" name={fieldName("province")} value={selectedProvince} />
      <input type="hidden" name={fieldName("city")} value={selectedCity} />
      <input type="hidden" name={fieldName("district")} value={selectedDistrict} />
      <input type="hidden" name={fieldName("village")} value={selectedVillage} />
      <input type="hidden" name={fieldName("postalCode")} value={postalCode} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Provinsi */}
        <ComboBox
          selectedKey={selectedProvince || undefined}
          onSelectionChange={(key) => {
            const name = key ? String(key) : ""
            setSelectedProvince(name)
            setSelectedCity("")
            setSelectedDistrict("")
            setSelectedVillage("")
            setPostalCode("")
            setCities([])
            setDistricts([])
            setVillages([])
          }}
          className="w-full"
        >
          <Label>Provinsi</Label>
          <ComboBox.InputGroup>
            <Input placeholder="Cari provinsi..." />
            <ComboBox.Trigger />
          </ComboBox.InputGroup>
          <ComboBox.Popover>
            <ListBox>
              {provinces.map(p => (
                <ListBox.Item key={p.name} id={p.name} textValue={p.name}>
                  {p.name}<ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </ComboBox.Popover>
        </ComboBox>

        {/* Kota/Kabupaten */}
        <ComboBox
          selectedKey={selectedCity || undefined}
          onSelectionChange={(key) => {
            const name = key ? String(key) : ""
            setSelectedCity(name)
            setSelectedDistrict("")
            setSelectedVillage("")
            setPostalCode("")
            setDistricts([])
            setVillages([])
          }}
          className="w-full"
          isDisabled={!provinceCode}
        >
          <Label>Kota/Kabupaten</Label>
          <ComboBox.InputGroup>
            <Input placeholder="Cari kota..." />
            <ComboBox.Trigger />
          </ComboBox.InputGroup>
          <ComboBox.Popover>
            <ListBox>
              {cities.map(c => (
                <ListBox.Item key={c.name} id={c.name} textValue={c.name}>
                  {c.name}<ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </ComboBox.Popover>
        </ComboBox>

        {/* Kecamatan */}
        <ComboBox
          selectedKey={selectedDistrict || undefined}
          onSelectionChange={(key) => {
            const name = key ? String(key) : ""
            setSelectedDistrict(name)
            setSelectedVillage("")
            setPostalCode("")
            setVillages([])
          }}
          className="w-full"
          isDisabled={!cityCode}
        >
          <Label>Kecamatan</Label>
          <ComboBox.InputGroup>
            <Input placeholder="Cari kecamatan..." />
            <ComboBox.Trigger />
          </ComboBox.InputGroup>
          <ComboBox.Popover>
            <ListBox>
              {districts.map(d => (
                <ListBox.Item key={d.name} id={d.name} textValue={d.name}>
                  {d.name}<ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </ComboBox.Popover>
        </ComboBox>

        {/* Kelurahan/Desa */}
        <ComboBox
          selectedKey={selectedVillage || undefined}
          onSelectionChange={(key) => {
            const name = key ? String(key) : ""
            setSelectedVillage(name)
            // Auto-fill postal code
            const village = villages.find(v => v.name === name)
            if (village?.postalCode) {
              setPostalCode(village.postalCode)
            }
          }}
          className="w-full"
          isDisabled={!districtCode}
        >
          <Label>Kelurahan/Desa</Label>
          <ComboBox.InputGroup>
            <Input placeholder="Cari kelurahan..." />
            <ComboBox.Trigger />
          </ComboBox.InputGroup>
          <ComboBox.Popover>
            <ListBox>
              {villages.map(v => (
                <ListBox.Item key={v.name} id={v.name} textValue={v.name}>
                  {v.name}{v.postalCode ? ` (${v.postalCode})` : ""}<ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </ComboBox.Popover>
        </ComboBox>

        {/* Kode Pos (auto-filled) */}
        <div className="flex flex-col gap-1.5">
          <Label>Kode Pos</Label>
          <Input
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
