import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale === "en" ? "en" : "zh-CN"}/support/wgt_demo`);
}
