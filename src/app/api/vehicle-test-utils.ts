/**
 * Helper bersama tes route kendaraan (merek + model).
 * `vi.mock` tetap literal di tiap berkas tes karena hoisting Vitest;
 * factory di bawah hanya didelegasikan dari factory berkas pemanggil.
 */
type AnyFn = (...a: unknown[]) => unknown
export type VehicleRouteMocks = { hasPermission: AnyFn; findMany: AnyFn; count: AnyFn }

export const vehiclePermissionFactory = (m: VehicleRouteMocks) => ({
  hasPermission: (...a: unknown[]) => m.hasPermission(...a),
})

export const vehiclePrismaFactory = (m: VehicleRouteMocks, model: "vehicleBrand" | "vehicleModel") => ({
  prisma: {
    [model]: {
      findMany: (...a: unknown[]) => m.findMany(...a),
      count: (...a: unknown[]) => m.count(...a),
    },
  },
})

export const SHARED_PAGINATION_CASES: Array<[string, number, number, number, number]> = [
  ["halaman=abc&pageSize=xyz", 1, 50, 0, 50],
  ["halaman=0&pageSize=9999", 1, 500, 0, 500],
  ["halaman=-2&pageSize=0", 1, 50, 0, 50],
]
