import { Brand } from "@/components/app/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-background p-5 sm:p-6">
      <Brand href="/sign-in" size="sm" />
      <main className="flex flex-1 items-center justify-center py-10">{children}</main>
    </div>
  );
}
