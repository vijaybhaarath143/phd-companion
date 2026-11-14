export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 p-6">
      <div className="text-[15px] font-semibold">PhD Companion</div>
      <main className="flex flex-1 items-center justify-center py-12">{children}</main>
    </div>
  );
}
