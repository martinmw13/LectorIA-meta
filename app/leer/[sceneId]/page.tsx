import { redirect } from "next/navigation";

// Old Oz addresses keep working by moving to the generic reader.
export default async function LeerSceneRoute({ params }: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await params;
  redirect(`/read/oz/${sceneId}`);
}
