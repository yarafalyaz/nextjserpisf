"use client"

import { useState, useEffect, useCallback } from "react"
import { Clock, MapPin, CheckCircle, LogIn, LogOut, Loader2 } from "lucide-react"
import { getTodayAttendance, selfCheckIn, selfCheckOut } from "@/actions/self-attendance.actions"
import { Button } from "@/components/ui/page-header"

interface AttendanceStatus {
  id: number
  checkIn: string | null
  checkOut: string | null
  status: string
  checkInLatitude: number | null
  checkInLongitude: number | null
  checkOutLatitude: number | null
  checkOutLongitude: number | null
}

function formatJam(iso: string | null): string {
  if (!iso) return "-"
  const d = new Date(iso)
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function getGreeting(): string {
  const jam = new Date().getHours()
  if (jam < 11) return "Selamat Pagi"
  if (jam < 15) return "Selamat Siang"
  if (jam < 18) return "Selamat Sore"
  return "Selamat Malam"
}

interface GeoCoords {
  latitude: number
  longitude: number
}

export function SelfAttendanceWidget() {
  const [status, setStatus] = useState<AttendanceStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<"checkin" | "checkout" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [geo, setGeo] = useState<GeoCoords | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [mounted, setMounted] = useState(false)

  // Hydration fix
  useEffect(() => { setMounted(true) }, [])

  const loadStatus = useCallback(async () => {
    try {
      const data = await getTodayAttendance()
      setStatus(data)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const getGeo = useCallback((): Promise<GeoCoords | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null)
        return
      }
      setGeoLoading(true)
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      )
    })
  }, [])

  // Terapkan geo dari state setelah didapat
  useEffect(() => {
    if (!geoLoading) return
    getGeo().then((coords) => {
      setGeo(coords)
      setGeoLoading(false)
    })
  }, [geoLoading, getGeo])

  const handleCheckIn = async () => {
    setError(null)
    setActionLoading("checkin")
    // Get fresh GPS
    const coords = await getGeo()
    setGeo(coords)
    setGeoLoading(false)
    try {
      await selfCheckIn(coords?.latitude, coords?.longitude)
      await loadStatus()
    } catch (e: any) {
      setError(e.message || "Gagal check-in")
    } finally {
      setActionLoading(null)
    }
  }

  const handleCheckOut = async () => {
    setError(null)
    setActionLoading("checkout")
    const coords = await getGeo()
    setGeo(coords)
    setGeoLoading(false)
    try {
      await selfCheckOut(coords?.latitude, coords?.longitude)
      await loadStatus()
    } catch (e: any) {
      setError(e.message || "Gagal check-out")
    } finally {
      setActionLoading(null)
    }
  }

  const jamStr = currentTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  const tanggalStr = currentTime.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  if (!mounted) {
    return (
      <div className="bg-surface rounded-2xl border border-default shadow-sm p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-40 bg-surface-secondary rounded" />
          <div className="h-4 w-64 bg-surface-secondary rounded" />
          <div className="h-14 w-full bg-surface-secondary rounded-xl" />
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-surface rounded-2xl border border-default shadow-sm p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-40 bg-surface-secondary rounded" />
          <div className="h-10 w-64 bg-surface-secondary rounded" />
          <div className="h-14 w-full bg-surface-secondary rounded-xl" />
        </div>
      </div>
    )
  }

  const sudahCheckIn = status !== null
  const sudahCheckOut = status?.checkOut !== null

  return (
    <div className="bg-surface rounded-2xl border border-default shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="relative px-6 pt-6 pb-5"
        style={{
          background: "linear-gradient(135deg, hsl(var(--primary-hsl)/0.12), hsl(var(--primary-hsl)/0.04))",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted">{getGreeting()},</p>
            <p className="text-xl font-bold text-foreground mt-0.5">Absensi Hari Ini</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-mono font-bold text-foreground tabular-nums">{jamStr}</div>
            <div className="text-xs text-muted mt-0.5">{tanggalStr}</div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Error */}
        {error && (
          <div className="bg-danger/10 text-danger border border-danger/20 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
            <span className="i-lucide-alert-triangle size-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Status Card */}
        {sudahCheckIn && (
          <div className="bg-surface-secondary/50 rounded-xl border border-default p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className={sudahCheckOut ? "text-success" : "text-warning"} />
              <span className="font-semibold text-foreground">
                {sudahCheckOut ? "Absensi Hari Ini Lengkap" : "Sedang Bekerja"}
              </span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">
                {status.status === "present" ? "Hadir" : status.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Check In */}
              <div className="bg-surface rounded-lg border border-default p-3">
                <div className="flex items-center gap-1.5 text-muted text-xs mb-1">
                  <LogIn size={12} />
                  <span>Check In</span>
                </div>
                <div className="text-lg font-mono font-bold text-foreground tabular-nums">
                  {formatJam(status.checkIn)}
                </div>
                {status.checkInLatitude && status.checkInLongitude && (
                  <a
                    href={`https://www.google.com/maps?q=${status.checkInLatitude},${status.checkInLongitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                  >
                    <MapPin size={10} />
                    {status.checkInLatitude.toFixed(4)}, {status.checkInLongitude.toFixed(4)}
                  </a>
                )}
              </div>

              {/* Check Out */}
              <div className="bg-surface rounded-lg border border-default p-3">
                <div className="flex items-center gap-1.5 text-muted text-xs mb-1">
                  <LogOut size={12} />
                  <span>Check Out</span>
                </div>
                <div className="text-lg font-mono font-bold text-foreground tabular-nums">
                  {sudahCheckOut ? formatJam(status.checkOut) : "--:--:--"}
                </div>
                {status.checkOutLatitude && status.checkOutLongitude && (
                  <a
                    href={`https://www.google.com/maps?q=${status.checkOutLatitude},${status.checkOutLongitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                  >
                    <MapPin size={10} />
                    {status.checkOutLatitude.toFixed(4)}, {status.checkOutLongitude.toFixed(4)}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Belum absen */}
        {!sudahCheckIn && (
          <div className="bg-surface-secondary/30 rounded-xl border border-dashed border-default p-4 text-center">
            <Clock size={28} className="mx-auto text-muted mb-2" />
            <p className="text-sm text-muted">Anda belum melakukan absensi hari ini</p>
            <p className="text-xs text-muted/70 mt-0.5">Klik tombol di bawah untuk check-in</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <Button
            onPress={handleCheckIn}
            isDisabled={sudahCheckIn || actionLoading !== null}
            variant="primary"
            className="flex-1 h-12 text-base font-semibold"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              borderRadius: "0.75rem",
              background: sudahCheckIn
                ? "var(--bg-secondary)"
                : "linear-gradient(135deg, hsl(142 76% 36%), hsl(142 60% 28%))",
              color: sudahCheckIn ? "var(--text-muted)" : "#fff",
              cursor: sudahCheckIn ? "not-allowed" : "pointer",
            }}
          >
            {actionLoading === "checkin" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <LogIn size={18} />
            )}
            {sudahCheckIn ? "Sudah Check-In" : "Check In"}
          </Button>

          <Button
            onPress={handleCheckOut}
            isDisabled={!sudahCheckIn || sudahCheckOut || actionLoading !== null}
            variant="secondary"
            className="flex-1 h-12 text-base font-semibold"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              borderRadius: "0.75rem",
              background: sudahCheckOut || !sudahCheckIn
                ? "var(--bg-secondary)"
                : "linear-gradient(135deg, hsl(0 84% 60%), hsl(0 70% 45%))",
              color: sudahCheckOut || !sudahCheckIn ? "var(--text-muted)" : "#fff",
              cursor: sudahCheckOut || !sudahCheckIn ? "not-allowed" : "pointer",
            }}
          >
            {actionLoading === "checkout" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <LogOut size={18} />
            )}
            {sudahCheckOut ? "Sudah Check-Out" : "Check Out"}
          </Button>
        </div>

        {/* GPS Status */}
        {mounted && geo && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted">
            <MapPin size={10} className={geo ? "text-success" : "text-muted"} />
            <span>GPS terdeteksi</span>
          </div>
        )}
        {mounted && !geo && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-warning">
            <MapPin size={10} />
            <span>GPS tidak tersedia — izinkan akses lokasi untuk akurasi</span>
          </div>
        )}
      </div>
    </div>
  )
}
