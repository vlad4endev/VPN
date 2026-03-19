import { redirect } from "next/navigation";

import { ReferralDashboard } from "@/components/referral-dashboard";
import { LogoutButton } from "@/components/logout-button";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export default async function DashboardPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      recordsAsReferrer: {
        include: {
          referee: {
            select: {
              email: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  const shareUrl = `${base}/register?ref=${encodeURIComponent(user.referralCode)}`;

  const invited = user.recordsAsReferrer.map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    referee: {
      email: r.referee.email,
      name: r.referee.name,
    },
  }));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">Кабинет</h1>
          <p className="mt-1 text-sm text-slate-500">{user.email}</p>
        </div>
        <LogoutButton />
      </div>
      <ReferralDashboard
        referralCode={user.referralCode}
        shareUrl={shareUrl}
        invited={invited}
      />
    </div>
  );
}
