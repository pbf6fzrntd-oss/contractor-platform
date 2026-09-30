import { toLlmsText } from "@/lib/public/profile";
import { getPublicBusiness, publicUrls } from "../data";

/** A plain-text summary AI assistants can read (the llms.txt convention). */
export async function GET(_request: Request, { params }: RouteContext<"/b/[slug]/llms.txt">) {
  const biz = await getPublicBusiness((await params).slug);
  if (!biz) return new Response("Not found", { status: 404 });
  const urls = publicUrls(biz.profile.slug, biz.profile.booking_available);
  return new Response(toLlmsText(biz.profile, urls.page, urls.booking, urls.agent), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
