import { redirect } from "next/navigation";
import { currentUser, landingPath } from "@/lib/auth/session";

export default async function RootPage() {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }
  redirect(landingPath(user));
}
