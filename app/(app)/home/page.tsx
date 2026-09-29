import { redirect } from "next/navigation";
import { requireAppContext } from "@/lib/auth/context";
import { homePath } from "@/lib/navigation";

// "/home" sends each business to its main screen (Today for lawn care, Inbox for trades).
export default async function HomeRedirect() {
  const { org, plan } = await requireAppContext();
  redirect(homePath(org.business_type, plan));
}
