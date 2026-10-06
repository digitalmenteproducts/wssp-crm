import { ROUTES } from "@/config/app";
import { appBaseUrl } from "@/lib/app-url";
import { canManageTeam, type CreatableRole } from "@/lib/team";
import { generateTemporaryPassword } from "@/lib/temporary-password";
import * as authAdminRepository from "@/repositories/auth-admin.repository";
import * as businessRepository from "@/repositories/business.repository";
import type { AddBusinessMemberError } from "@/repositories/business.repository";
import { createBusinessUserSchema } from "@/schemas/team";
import * as businessService from "@/services/business/business.service";
import type { BusinessActionResult } from "@/services/business/business.service";
import {
  notConfiguredCredentialsSender,
  sendBusinessUserCredentials,
  type CredentialsSender,
} from "@/services/business/credentials-mailer";

export const ALREADY_IN_TEAM_ERROR = "Este usuario ya pertenece al equipo.";
export const EMAIL_EXISTS_ERROR =
  "Ese email ya tiene una cuenta en la plataforma. Por ahora no se puede aÃ±adir a otro negocio desde aquÃ­.";

const MEMBER_ERRORS: Record<AddBusinessMemberError, string> = {
  forbidden: "Sin permiso para gestionar el equipo.",
  invalid_role: "Rol no permitido. Solo Administrador o Profesional.",
  already_member: ALREADY_IN_TEAM_ERROR,
  unknown: "No se pudo aÃ±adir el usuario al equipo.",
};

export type CreateBusinessUserDeps = {
  resolveWorkspace: () => Promise<BusinessActionResult>;
  listMemberEmails: (businessId: string) => Promise<{ emails: string[]; error: string | null }>;
  generatePassword: () => string;
  createAuthUser: typeof authAdminRepository.createConfirmedUser;
  deleteAuthUser: typeof authAdminRepository.deleteUser;
  addMember: typeof businessRepository.addBusinessMember;
  sender: CredentialsSender;
  loginUrl: () => string;
};

const defaultDeps: CreateBusinessUserDeps = {
  resolveWorkspace: businessService.resolveCurrentWorkspace,
  listMemberEmails: async (businessId) => {
    const result = await businessRepository.listBusinessMembers(businessId);
    return {
      emails: result.data.map((m) => (m.email ?? "").toLowerCase()).filter(Boolean),
      error: result.error,
    };
  },
  generatePassword: () => generateTemporaryPassword(),
  createAuthUser: authAdminRepository.createConfirmedUser,
  deleteAuthUser: authAdminRepository.deleteUser,
  addMember: businessRepository.addBusinessMember,
  sender: notConfiguredCredentialsSender,
  loginUrl: () => `${appBaseUrl()}${ROUTES.login}`,
};

export type CreateBusinessUserResult =
  | {
      ok: true;
      user: { userId: string; name: string; email: string; role: CreatableRole };
      businessName: string;
      /** Solo en memoria para entregar las credenciales; nunca se persiste ni se registra. */
      temporaryPassword: string;
    }
  | { ok: false; error: string };

/**
 * Crea el auth user (email confirmado + contraseÃ±a temporal) y su membership en el negocio activo.
 * El negocio sale de la sesiÃ³n; la RPC vuelve a validar owner/admin y rol en la DB.
 */
export async function createBusinessUser(
  input: unknown,
  deps: CreateBusinessUserDeps = defaultDeps,
): Promise<CreateBusinessUserResult> {
  const workspace = await deps.resolveWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const { business, membership } = workspace.workspace;
  if (!canManageTeam(membership.role)) {
    return { ok: false, error: MEMBER_ERRORS.forbidden };
  }

  const parsed = createBusinessUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(" ") };
  }
  const { name, email, role } = parsed.data;

  const members = await deps.listMemberEmails(business.id);
  if (members.error) {
    return { ok: false, error: "No se pudo comprobar el equipo." };
  }
  if (members.emails.includes(email)) {
    return { ok: false, error: ALREADY_IN_TEAM_ERROR };
  }

  const temporaryPassword = deps.generatePassword();
  const created = await deps.createAuthUser({ email, password: temporaryPassword, name });
  if (created.error === "email_exists") {
    return { ok: false, error: EMAIL_EXISTS_ERROR };
  }
  if (created.error !== null) {
    return { ok: false, error: "No se pudo crear el usuario." };
  }

  const added = await deps.addMember({ businessId: business.id, userId: created.userId, role });
  if (added.error !== null) {
    await deps.deleteAuthUser(created.userId);
    return { ok: false, error: MEMBER_ERRORS[added.error] };
  }

  return {
    ok: true,
    user: { userId: created.userId, name, email, role },
    businessName: business.name,
    temporaryPassword,
  };
}

export type CreateUserActionResult =
  | { ok: true; message: string; emailSent: true }
  /** Sin proveedor de correo: la contraseÃ±a se muestra una Ãºnica vez a quien creÃ³ el usuario. */
  | { ok: true; message: string; emailSent: false; email: string; temporaryPassword: string; loginUrl: string }
  | { ok: false; error: string };

export async function createBusinessUserAndSendCredentials(
  input: unknown,
  deps: CreateBusinessUserDeps = defaultDeps,
): Promise<CreateUserActionResult> {
  const created = await createBusinessUser(input, deps);
  if (!created.ok) return created;

  const loginUrl = deps.loginUrl();
  const delivery = await sendBusinessUserCredentials(
    {
      name: created.user.name,
      email: created.user.email,
      role: created.user.role,
      businessName: created.businessName,
      loginUrl,
      temporaryPassword: created.temporaryPassword,
    },
    deps.sender,
  );

  if (delivery.sent) {
    return { ok: true, emailSent: true, message: `Usuario creado. Enviamos las credenciales a ${created.user.email}.` };
  }
  return {
    ok: true,
    emailSent: false,
    email: created.user.email,
    temporaryPassword: created.temporaryPassword,
    loginUrl,
    message: "Usuario creado correctamente.",
  };
}
