import { redirect } from "next/navigation";

type InviteAcceptSearchParams = {
  token?: string | string[];
};

export default async function LegacyWorkspaceInviteAcceptPage({
  searchParams,
}: {
  searchParams?: Promise<InviteAcceptSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawToken = resolvedSearchParams.token;
  const token = String(
    Array.isArray(rawToken) ? rawToken[0] : (rawToken ?? ""),
  ).trim();

  redirect(
    token
      ? `/invite/accept?token=${encodeURIComponent(token)}`
      : "/invite/accept",
  );
}
