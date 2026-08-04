import { redirect } from "next/navigation";

import { ROUTES } from "@/config/app";
import { getCurrentUser } from "@/repositories/auth.repository";

export default async function HomePage() {
  const { data } = await getCurrentUser();

  redirect(data.user ? ROUTES.panel : ROUTES.login);
}
