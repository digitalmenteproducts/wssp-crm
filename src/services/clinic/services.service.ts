import { hasClinicAgenda } from "@/lib/industry";
import {
  clinicErrorMessage,
  type ClinicErrorCode,
} from "@/lib/clinic/errors";
import * as clinicRepository from "@/repositories/clinic.repository";
import * as businessService from "@/services/business/business.service";
import type { ClinicActionResult } from "@/services/clinic/appointment.service";
import {
  upsertClinicServiceAvailabilitySchema,
  upsertClinicServiceSchema,
  type UpsertClinicServiceAvailabilityInput,
  type UpsertClinicServiceInput,
} from "@/schemas/clinic";
import type {
  ClinicCalendarResource,
  ClinicService,
  ClinicServiceAvailability,
  ClinicServiceListItem,
} from "@/types/clinic";

function formatZodIssues(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

function fail(
  code: ClinicErrorCode,
  field?: string,
  override?: string,
): ClinicActionResult<never> {
  return {
    ok: false,
    code,
    field,
    error: override ?? clinicErrorMessage(code),
  };
}

async function requireClinicAdminWorkspace() {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return {
      ok: false as const,
      error: workspace.ok ? "Sin empresa." : workspace.error,
      code: "GENERIC" as const,
    };
  }
  if (!hasClinicAgenda(workspace.workspace.business.industry)) {
    return {
      ok: false as const,
      error: "La agenda clínica no está disponible para este negocio.",
      code: "GENERIC" as const,
    };
  }
  const role = workspace.workspace.membership.role;
  if (role !== "owner" && role !== "admin") {
    return {
      ok: false as const,
      error: "Sin permiso de administración.",
      code: "GENERIC" as const,
    };
  }
  return { ok: true as const, workspace: workspace.workspace };
}

async function requireClinicMemberWorkspace() {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return {
      ok: false as const,
      error: workspace.ok ? "Sin empresa." : workspace.error,
      code: "GENERIC" as const,
    };
  }
  if (!hasClinicAgenda(workspace.workspace.business.industry)) {
    return {
      ok: false as const,
      error: "La agenda clínica no está disponible para este negocio.",
      code: "GENERIC" as const,
    };
  }
  return { ok: true as const, workspace: workspace.workspace };
}

function joinServiceListItems(input: {
  services: ClinicService[];
  links: Array<{ service_id: string; resource_id: string }>;
  resources: ClinicCalendarResource[];
}): ClinicServiceListItem[] {
  const resourceNameById = new Map(
    input.resources.map((r) => [r.id, r.name] as const),
  );
  const linksByService = new Map<string, string[]>();
  for (const link of input.links) {
    const list = linksByService.get(link.service_id) ?? [];
    list.push(link.resource_id);
    linksByService.set(link.service_id, list);
  }

  return input.services.map((service) => {
    const resource_ids = linksByService.get(service.id) ?? [];
    const resource_names = resource_ids.map(
      (id) => resourceNameById.get(id) ?? id,
    );
    return { ...service, resource_ids, resource_names };
  });
}

export async function listServicesPageData(): Promise<
  ClinicActionResult<{
    services: ClinicServiceListItem[];
    resources: ClinicCalendarResource[];
    availabilityByServiceId: Record<string, ClinicServiceAvailability[]>;
  }>
> {
  const gate = await requireClinicMemberWorkspace();
  if (!gate.ok) return gate;

  const businessId = gate.workspace.business.id;
  const [servicesRes, linksRes, resourcesRes] = await Promise.all([
    clinicRepository.listServices(businessId),
    clinicRepository.listServiceResourceLinks(businessId),
    clinicRepository.listResources(businessId),
  ]);

  if (servicesRes.error) {
    return fail("GENERIC", undefined, servicesRes.error.message);
  }
  if (linksRes.error) {
    return fail("GENERIC", undefined, linksRes.error.message);
  }
  if (resourcesRes.error) {
    return fail("GENERIC", undefined, resourcesRes.error.message);
  }

  const services = servicesRes.data ?? [];
  const availabilityByServiceId: Record<string, ClinicServiceAvailability[]> =
    {};

  await Promise.all(
    services.map(async (service) => {
      const { data, error } = await clinicRepository.listServiceAvailability(
        businessId,
        service.id,
      );
      if (!error && data) {
        availabilityByServiceId[service.id] = data;
      }
    }),
  );

  return {
    ok: true,
    data: {
      services: joinServiceListItems({
        services,
        links: linksRes.data ?? [],
        resources: resourcesRes.data ?? [],
      }),
      resources: resourcesRes.data ?? [],
      availabilityByServiceId,
    },
  };
}

export async function replaceServiceAvailability(
  businessId: string,
  serviceId: string,
  rows: UpsertClinicServiceAvailabilityInput[],
): Promise<ClinicActionResult<ClinicServiceAvailability[]>> {
  const existing = await clinicRepository.listServiceAvailability(
    businessId,
    serviceId,
  );
  if (existing.error) {
    return fail("GENERIC", undefined, existing.error.message);
  }

  for (const row of existing.data ?? []) {
    const { error } = await clinicRepository.deleteServiceAvailability(
      businessId,
      row.id,
    );
    if (error) return fail("GENERIC", undefined, error.message);
  }

  const saved: ClinicServiceAvailability[] = [];
  for (const row of rows) {
    const parsed = upsertClinicServiceAvailabilitySchema.safeParse({
      ...row,
      service_id: serviceId,
    });
    if (!parsed.success) {
      return fail("VALIDATION", undefined, formatZodIssues(parsed.error));
    }
    const start = parsed.data.start_time.slice(0, 5);
    const end = parsed.data.end_time.slice(0, 5);
    if (end <= start) {
      return fail("INVALID_TIME_ORDER");
    }
    const { data, error } = await clinicRepository.upsertServiceAvailability(
      businessId,
      {
        service_id: serviceId,
        day_of_week: parsed.data.day_of_week,
        start_time: parsed.data.start_time,
        end_time: parsed.data.end_time,
        active: parsed.data.active,
      },
    );
    if (error || !data) {
      return fail("GENERIC", undefined, error?.message);
    }
    saved.push(data);
  }

  return { ok: true, data: saved };
}

export async function upsertServiceAvailability(
  input: UpsertClinicServiceAvailabilityInput,
): Promise<ClinicActionResult<ClinicServiceAvailability>> {
  const parsed = upsertClinicServiceAvailabilitySchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", undefined, formatZodIssues(parsed.error));
  }
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;

  const start = parsed.data.start_time.slice(0, 5);
  const end = parsed.data.end_time.slice(0, 5);
  if (end <= start) {
    return fail("INVALID_TIME_ORDER");
  }

  const service = await clinicRepository.getService(
    gate.workspace.business.id,
    parsed.data.service_id,
  );
  if (service.error || !service.data) {
    return fail("GENERIC", undefined, "Servicio no encontrado.");
  }

  const { data, error } = await clinicRepository.upsertServiceAvailability(
    gate.workspace.business.id,
    parsed.data,
  );
  if (error || !data) {
    return fail("GENERIC", undefined, error?.message);
  }
  return { ok: true, data, message: "Disponibilidad del servicio guardada." };
}

export async function deleteServiceAvailability(
  id: string,
): Promise<ClinicActionResult> {
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;
  const { error } = await clinicRepository.deleteServiceAvailability(
    gate.workspace.business.id,
    id,
  );
  if (error) return fail("GENERIC", undefined, error.message);
  return { ok: true, message: "Bloque de disponibilidad eliminado." };
}

export type UpsertClinicServicePayload = UpsertClinicServiceInput & {
  availability?: UpsertClinicServiceAvailabilityInput[];
};

export async function upsertService(
  input: UpsertClinicServicePayload,
): Promise<ClinicActionResult<ClinicServiceListItem>> {
  const parsed = upsertClinicServiceSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", undefined, formatZodIssues(parsed.error));
  }
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;

  const businessId = gate.workspace.business.id;
  const initialId = parsed.data.initial_consultation_service_id ?? null;
  if (initialId && parsed.data.id && initialId === parsed.data.id) {
    return fail(
      "VALIDATION",
      "initial_consultation_service_id",
      "La consulta inicial no puede ser el mismo servicio.",
    );
  }
  if (initialId) {
    const initialSvc = await clinicRepository.getService(businessId, initialId);
    if (initialSvc.error || !initialSvc.data) {
      return fail(
        "VALIDATION",
        "initial_consultation_service_id",
        "Servicio de consulta inicial no encontrado.",
      );
    }
  }

  for (const resourceId of parsed.data.resource_ids) {
    const resource = await clinicRepository.getResource(businessId, resourceId);
    if (resource.error || !resource.data) {
      return fail("RESOURCE_NOT_FOUND", "resource_ids");
    }
  }

  const { data: saved, error } = await clinicRepository.upsertService(
    businessId,
    {
      id: parsed.data.id,
      name: parsed.data.name,
      duration_minutes: parsed.data.duration_minutes,
      requires_initial_consultation: parsed.data.requires_initial_consultation,
      initial_consultation_service_id: initialId,
      use_specific_availability: parsed.data.use_specific_availability,
      active: parsed.data.active,
      admin_notes: parsed.data.admin_notes,
    },
  );
  if (error || !saved) {
    return fail("GENERIC", undefined, error?.message);
  }

  const { error: linkError } = await clinicRepository.replaceServiceResources(
    businessId,
    saved.id,
    parsed.data.resource_ids,
  );
  if (linkError) {
    return fail("GENERIC", undefined, linkError.message);
  }

  if (parsed.data.use_specific_availability) {
    const availabilityRows = input.availability ?? [];
    const sync = await replaceServiceAvailability(
      businessId,
      saved.id,
      availabilityRows.map((row) => ({ ...row, service_id: saved.id })),
    );
    if (!sync.ok) return sync;
  } else {
    const cleared = await replaceServiceAvailability(businessId, saved.id, []);
    if (!cleared.ok) return cleared;
  }

  const resources = await clinicRepository.listResources(businessId);
  if (resources.error) {
    return fail("GENERIC", undefined, resources.error.message);
  }

  const [item] = joinServiceListItems({
    services: [saved],
    links: parsed.data.resource_ids.map((resource_id) => ({
      service_id: saved.id,
      resource_id,
    })),
    resources: resources.data ?? [],
  });

  return {
    ok: true,
    data: item!,
    message: parsed.data.id ? "Servicio actualizado." : "Servicio creado.",
  };
}
