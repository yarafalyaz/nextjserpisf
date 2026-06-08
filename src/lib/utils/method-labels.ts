/**
 * Friendly labels for payment & shipping method codes used across sales documents.
 * Falls back to the raw value so legacy free-text entries still display sensibly.
 */
export const paymentMethodLabels: Record<string, string> = {
  transfer: "Transfer Bank",
  cash: "Tunai",
  check: "Cek/Giro",
  giro: "Giro",
  card: "Kartu Kredit/Debit",
  ewallet: "E-Wallet",
  termin: "Termin/Tempo",
}

export const shippingMethodLabels: Record<string, string> = {
  pickup: "Ambil Sendiri",
  courier: "Kurir",
  expedition: "Ekspedisi/Cargo",
  delivery: "Diantar",
}

export function paymentMethodLabel(value?: string | null): string {
  if (!value) return ""
  return paymentMethodLabels[value] ?? value
}

export function shippingMethodLabel(value?: string | null): string {
  if (!value) return ""
  return shippingMethodLabels[value] ?? value
}
