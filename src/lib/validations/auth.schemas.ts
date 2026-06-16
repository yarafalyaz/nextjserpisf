import { z } from "zod"

// Localized email regex — Zod's bundled `.email()` is strict (requires a TLD
// ≥ 2 chars, no underscores in domain, etc.) which breaks the existing test
// fixtures that use `y@z.c` / `admin@test.com` patterns. The schemas in
// schemas.ts use the same Zod builtin and have the same constraint, but those
// callers go through the form layer which trims + lowercases. For server
// actions the form is already trimmed; we only need a sanity check that the
// shape is `local@domain.tld` and reject obvious garbage like `not-an-email`.
// The actual lookup against the users.email column is unique-indexed in
// Postgres, so a non-existent domain is rejected at sign-in, not here.
//
// Permissive but not absurd: blocks whitespace, requires "@", requires at
// least one "." in the domain with 1+ char on each side, and caps total
// length so a 5MB string never reaches the user.create / user.update path.
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emailField = z
  .string()
  .min(1, "Email wajib diisi")
  .max(255, "Email terlalu panjang")
  .regex(emailRegex, "Format email tidak valid")

// ==================== LOGIN ====================
// Mirrors changePassword/createUser's password floor: the UI sends these as
// FormData. We add a length cap so an attacker can't push a 1MB "password"
// blob that costs bcrypt CPU on a tight account-lockout loop. Email format is
// checked so the error surface stays consistent ("Email atau password salah"
// — not "Invalid email" leaking that the address itself is malformed).

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password wajib diisi").max(256, "Password terlalu panjang"),
})

// ==================== CHANGE PASSWORD ====================
// Replaces the hand-rolled length check in changePassword. Enforces an
// 8-char minimum on the new password (matches the policy createUser also
// uses, so a user can't be created with a password weaker than they're
// allowed to change it to later). `currentPassword` is required for the
// bcrypt.compare step; the action extracts the userId from the session, so
// this schema only gates the two password strings.

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Password lama wajib diisi")
      .max(256, "Password terlalu panjang"),
    newPassword: z
      .string()
      .min(8, "Password baru minimal 8 karakter")
      .max(256, "Password terlalu panjang"),
  })
  .strict()

// ==================== CREATE USER ====================
// The createUser action previously hand-parsed `formData.get("name")` /
// `formData.get("email")` / `formData.get("password")` with no format / length
// validation, then did its own length check. An authenticated manage_users
// holder could push (a) an empty name (rows visible as "" in the user list),
// (b) a non-email string ("not-an-email") — which then triggered a confusing
// Prisma unique-constraint crash on the email column if it happened to
// collide, (c) a 5MB+ password blob (DoS on the bcrypt.hash step). This
// schema caps the inputs, forces an email format, and centralises the
// password length policy in one place.
//
// `roleIds` come in as formData.getAll("roleIds").map(Number) — we
// re-validate them via `createUserRoleIdsSchema` so the server action can
// keep its hand-rolled getAll loop (formData.getAll is what carries the
// array) but delegate the actual constraint check to Zod.

const createUserRoleIdsSchema = z
  .array(
    z.coerce
      .number({ error: "Role ID tidak valid" })
      .int("Role ID harus bilangan bulat")
      .positive("Role ID harus positif"),
  )
  .transform((ids) => Array.from(new Set(ids))) // de-dupe
  .optional()

export const createUserSchema = z
  .object({
    name: z.string().min(1, "Nama wajib diisi").max(255, "Nama terlalu panjang"),
    email: emailField,
    password: z
      .string()
      .min(8, "Password minimal 8 karakter")
      .max(256, "Password terlalu panjang"),
    roleIds: createUserRoleIdsSchema,
  })
  .strict()

// ==================== UPDATE PROFILE ====================
// Same class of fix as createUser. updateProfile previously did
// `if (!name || !email) return { error: "..." }` — an empty string passed
// the truthiness check (a non-empty "" is still truthy), an untrimmed "   "
// was accepted, and any non-email string could be persisted to the email
// column (the UI uses it as a login identifier; an admin typing
// "garbage string" would lock themselves out of their own account on next
// login).

export const updateProfileSchema = z
  .object({
    name: z.string().min(1, "Nama wajib diisi").max(255, "Nama terlalu panjang").trim(),
    email: emailField,
  })
  .strict()

// ==================== UPDATE USER ROLES ====================
// Wire format is a plain number[] (server action signature), not FormData.
// Tighten the input type so the role-Ids array cannot be bypassed by a caller
// who managed to pass a non-array (the action calls `roleIds.map(...)` which
// would throw on non-arrays) or by negative/zero ids (the .connect would
// silently no-op on id=0 and throw on negative).

export const updateUserRolesSchema = z
  .array(
    z.coerce
      .number({ error: "Role ID tidak valid" })
      .int("Role ID harus bilangan bulat")
      .positive("Role ID harus positif"),
  )
  .transform((ids) => Array.from(new Set(ids)))
