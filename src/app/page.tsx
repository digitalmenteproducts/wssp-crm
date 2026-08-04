import { redirect } from "next/navigation";

import { ROUTES } from "@/config/app";
import { getPublicEnvSafe } from "@/lib/env";
import { getCurrentUser } from "@/repositories/auth.repository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!getPublicEnvSafe()) {
    redirect(ROUTES.login);
  }

  const { data } = await getCurrentUser();

  redirect(data.user ? ROUTES.panel : ROUTES.login);
}
