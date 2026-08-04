import { createClient } from "@/lib/supabase/server";
import type {
  Business,
  BusinessSettings,
  BusinessUser,
} from "@/types/business";

export async function findMembershipByUserId(userId: string) {
  const supabase = await createClient();

  return supabase
    .from("business_users")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<BusinessUser>();
}

export async function findBusinessById(businessId: string) {
  const supabase = await createClient();

  return supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle<Business>();
}

export async function findSettingsByBusinessId(businessId: string) {
  const supabase = await createClient();

  return supabase
    .from("business_settings")
    .select("*")
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
      | "openai_api_key"
      | "whatsapp_access_token"
      | "whatsapp_phone_number_id"
      | "whatsapp_business_account_id"
      | "whatsapp_verify_token"
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
    .select("*")
    .single<BusinessSettings>();
}
