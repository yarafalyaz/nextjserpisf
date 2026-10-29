// Store toast bersama tes tombol (tanpa mock sendiri): mock tiap berkas
// cukup 3 baris import + vi.mock ke store ini — bukan blok 15 baris
// duplikat per berkas (Sonar new-code duplication).
export const testToastCalls: { ok: string[]; err: string[] } = { ok: [], err: [] }

export function resetTestToastCalls() {
  testToastCalls.ok = []
  testToastCalls.err = []
}
