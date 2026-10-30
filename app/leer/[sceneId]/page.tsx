import { redirect } from "next/navigation";
import { LEGACY_ROUTE_BOOK_ID } from "@/core/book-capabilities";

// Old Oz addresses keep working by moving to the generic reader.
export default async function LeerSceneRoute({ params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  redirect(`/read/${LEGACY_ROUTE_BOOK_ID}/${sceneId}`);
}
