import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db/prisma"

/**
 * Integritas relasi RBAC, pengguna, karyawan, dan alur persetujuan (putaran 253)
 * — READ-ONLY, gate `RUN_DB_INTEGRATION=1`.
 *
 * Menguji invarian struktur hak akses dan entitas manusia yang menopang keamanan aplikasi:
 *
 *  1. Pengguna & Peran (RBAC):
 *     - Tabel pivot `_UserRoles` tidak boleh memiliki baris yatim piatu (foreign key `A` dan `B`
 *       wajib menunjuk role dan user yang ada).
 *     - Tabel pivot `_RolePermissions` tidak boleh memiliki baris yatim piatu (foreign key `A` dan `B`
 *       wajib menunjuk permission dan role yang ada).
 *     - Setiap pengguna aktif harus memiliki setidaknya satu peran (tidak ada akun aktif tak berhak).
 *  2. Pengguna ↔ Karyawan:
 *     - Setiap karyawan yang menautkan `user_id` wajib menunjuk user yang hidup.
 *     - Satu user tidak boleh ditautkan ke lebih dari satu karyawan hidup (`user_id` 1-to-1 semantics).
 *  3. Alur Persetujuan (`ApprovalWorkflowStep`):
 *     - Setiap langkah persetujuan wajib memiliki penanggung jawab: `role_id` atau `userId`
 *       tidak boleh keduanya NULL (langkah tanpa penanggung jawab membuntukan transaksi).
 *     - Bila `role_id` terisi, perannya wajib ada di tabel `roles`.
 *     - Bila `user_id` terisi, penggunanya wajib ada di tabel `users`.
 */

const SKIP = process.env.RUN_DB_INTEGRATION !== "1"

describe("integritas relasi RBAC, pengguna, karyawan, dan alur persetujuan (DB, read-only)", () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it.skipIf(SKIP)(
    "tabel pivot RBAC (_UserRoles, _RolePermissions) bebas dari baris yatim dan pengguna aktif memiliki peran",
    async () => {
      // 1. Pivot _UserRoles
      const orphanedUserRoles = await prisma.$queryRaw<
        Array<{ roleId: number; userId: number }>
      >`
        SELECT ur.A AS roleId, ur.B AS userId
        FROM _UserRoles ur
        LEFT JOIN users u ON u.id = ur.B
        LEFT JOIN roles r ON r.id = ur.A
        WHERE u.id IS NULL OR r.id IS NULL;
      `

      expect(
        orphanedUserRoles,
        `Ditemukan relasi _UserRoles yang menunjuk user atau role tidak ada: ${JSON.stringify(
          orphanedUserRoles,
        )}`,
      ).toEqual([])

      // 2. Pivot _RolePermissions
      const orphanedRolePerms = await prisma.$queryRaw<
        Array<{ permissionId: number; roleId: number }>
      >`
        SELECT rp.A AS permissionId, rp.B AS roleId
        FROM _RolePermissions rp
        LEFT JOIN permissions p ON p.id = rp.A
        LEFT JOIN roles r ON r.id = rp.B
        WHERE p.id IS NULL OR r.id IS NULL;
      `

      expect(
        orphanedRolePerms,
        `Ditemukan relasi _RolePermissions yang menunjuk permission atau role tidak ada: ${JSON.stringify(
          orphanedRolePerms,
        )}`,
      ).toEqual([])

      // 3. Pengguna aktif tanpa peran
      const activeUsersWithoutRole = await prisma.$queryRaw<
        Array<{ id: number; email: string }>
      >`
        SELECT u.id, u.email
        FROM users u
        LEFT JOIN _UserRoles ur ON ur.B = u.id
        WHERE u.is_active = 1
          AND ur.A IS NULL;
      `

      expect(
        activeUsersWithoutRole,
        `Ditemukan pengguna aktif yang tidak memiliki role apa pun: ${JSON.stringify(
          activeUsersWithoutRole,
        )}`,
      ).toEqual([])
    },
  )

  it.skipIf(SKIP)(
    "penautan karyawan ↔ pengguna konsisten dan 1-ke-1",
    async () => {
      // 1. Karyawan menunjuk user yang tidak ada
      const orphanedEmployeeUsers = await prisma.$queryRaw<
        Array<{ employeeId: number; name: string; userId: number }>
      >`
        SELECT e.id AS employeeId, e.name, e.user_id AS userId
        FROM employees e
        LEFT JOIN users u ON u.id = e.user_id
        WHERE e.user_id IS NOT NULL
          AND e.deleted_at IS NULL
          AND u.id IS NULL;
      `

      expect(
        orphanedEmployeeUsers,
        `Ditemukan karyawan aktif yang menunjuk user_id tidak ada: ${JSON.stringify(
          orphanedEmployeeUsers,
        )}`,
      ).toEqual([])

      // 2. Satu user ditautkan ke lebih dari 1 karyawan aktif
      const duplicateUserLinks = await prisma.$queryRaw<
        Array<{ userId: number; employeeCount: number }>
      >`
        SELECT e.user_id AS userId, COUNT(*) AS employeeCount
        FROM employees e
        WHERE e.user_id IS NOT NULL
          AND e.deleted_at IS NULL
        GROUP BY e.user_id
        HAVING COUNT(*) > 1;
      `

      expect(
        duplicateUserLinks,
        `Ditemukan user_id yang ditautkan ke lebih dari satu karyawan aktif: ${JSON.stringify(
          duplicateUserLinks,
        )}`,
      ).toEqual([])
    },
  )

  it.skipIf(SKIP)(
    "langkah alur persetujuan (approval_workflow_steps) memiliki approver valid",
    async () => {
      // 1. Langkah tanpa penanggung jawab (keduanya NULL)
      const unassignedSteps = await prisma.$queryRaw<
        Array<{ stepId: number; workflowId: number }>
      >`
        SELECT id AS stepId, workflow_id AS workflowId
        FROM approval_workflow_steps
        WHERE role_id IS NULL AND user_id IS NULL;
      `

      expect(
        unassignedSteps,
        `Ditemukan langkah approval yang tidak memiliki role_id dan user_id: ${JSON.stringify(
          unassignedSteps,
        )}`,
      ).toEqual([])

      // 2. role_id yang tidak ada di tabel roles
      const brokenRoles = await prisma.$queryRaw<
        Array<{ stepId: number; roleId: number; workflowId: number }>
      >`
        SELECT aws.id AS stepId, aws.role_id AS roleId, aws.workflow_id AS workflowId
        FROM approval_workflow_steps aws
        LEFT JOIN roles r ON r.id = aws.role_id
        WHERE aws.role_id IS NOT NULL
          AND r.id IS NULL;
      `

      expect(
        brokenRoles,
        `Ditemukan langkah approval dengan role_id yang tidak ada di tabel roles: ${JSON.stringify(
          brokenRoles,
        )}`,
      ).toEqual([])

      // 3. user_id yang tidak ada di tabel users
      const brokenUsers = await prisma.$queryRaw<
        Array<{ stepId: number; userId: number; workflowId: number }>
      >`
        SELECT aws.id AS stepId, aws.user_id AS userId, aws.workflow_id AS workflowId
        FROM approval_workflow_steps aws
        LEFT JOIN users u ON u.id = aws.user_id
        WHERE aws.user_id IS NOT NULL
          AND u.id IS NULL;
      `

      expect(
        brokenUsers,
        `Ditemukan langkah approval dengan user_id yang tidak ada di tabel users: ${JSON.stringify(
          brokenUsers,
        )}`,
      ).toEqual([])
    },
  )
})
