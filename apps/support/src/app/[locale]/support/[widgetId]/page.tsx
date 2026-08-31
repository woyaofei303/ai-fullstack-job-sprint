import SupportChat from "../../../../features/chat/support-chat";

export default async function SupportPage({
  params,
}: {
  params: Promise<{ locale: string; widgetId: string }>;
}) {
  const { locale, widgetId } = await params;
  return (
    <SupportChat
      widgetId={widgetId}
      initialLocale={locale === "en" ? "en" : "zh-CN"}
    />
  );
}
