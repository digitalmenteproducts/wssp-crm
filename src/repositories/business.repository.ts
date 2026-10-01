import { createClient } from "@/lib/supabase/server";
import type {
  Business,
  BusinessMember,
  BusinessSettings,
  BusinessUser,
} from "@/types/business";

/** Todas las memberships del usuario de la sesión (RLS: user_id = auth.uid()). */
export async function listMembershipsByUserId(
  userId: string,
): Promise<{ data: BusinessUser[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_users")
    .select("id, business_id, user_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("business_id", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as BusinessUser[], error: null };
}

/** RPC security definer: exige que auth.uid() sea owner/admin de businessId. */
export async function listBusinessMembers(
  businessId: string,
): Promise<{ data: BusinessMember[]; error: string | null; forbidden: boolean }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("list_business_members", {
    p_business_id: businessId,
  });

  if (error) {
    return { data: [], error: error.message, forbidden: error.code === "42501" };
  }

  return { data: (data ?? []) as BusinessMember[], error: null, forbidden: false };
}

export async function findBusinessById(businessId: string) {
  const supabase = await createClient();

  return supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle<Business>();
}

const SETTINGS_COLUMNS = [
  "business_id",
  "whatsapp_phone_number_id",
  "whatsapp_business_account_id",
  "whatsapp_token_expires_at",
  "whatsapp_connection_status",
  "whatsapp_connected_at",
  "whatsapp_display_phone",
  "whatsapp_coexistence",
  "classification_prompt",
  "classification_inactivity_hours",
  "ai_engine_enabled",
  "updated_at",
].join(", ");

export async function findSettingsByBusinessId(businessId: string) {
  const supabase = await createClient();

  return supabase
    .from("business_settings")
    .select(SETTINGS_COLUMNS)
    .eq("business_id", businessId)
    .maybeSingle<BusinessSettings>();
}

export async function createBusinessForCurrentUser(input: {
  name: string;
  slug: string;
  supportEmail?: string | null;
}) {
  const supabase = await createClient();

  return supabase.rpc("create_business_for_current_user", {
    p_name: input.name,
    p_slug: input.slug,
    p_support_email: input.supportEmail ?? null,
  });
}

export async function updateBusiness(
  businessId: string,
  patch: Partial<
    Pick<Business, "name" | "support_email" | "timezone" | "slug">
  >,
) {
  const supabase = await createClient();

  return supabase
    .from("businesses")
    .update(patch)
    .eq("id", businessId)
    .select("*")
    .single<Business>();
}

export async function updateSettings(
  businessId: string,
  patch: Partial<
    Pick<
      BusinessSettings,
      | "whatsapp_phone_number_id"
      | "whatsapp_business_account_id"
      | "whatsapp_token_expires_at"
      | "whatsapp_connection_status"
      | "whatsapp_connected_at"
      | "whatsapp_display_phone"
      | "whatsapp_coexistence"
      | "classification_prompt"
      | "ai_engine_enabled"
    >
  >,
) {
  const supabase = await createClient();

  return supabase
    .from("business_settings")
    .update(patch)
    .eq("business_id", businessId)
    .select(SETTINGS_COLUMNS)
    .single<BusinessSettings>();
}
