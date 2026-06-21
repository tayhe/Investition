import { AccountManager } from "@/components/account-manager";

export default function AccountsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">账户管理</h1>
        <p className="text-muted mt-1">管理你的券商账户和手动录入账户</p>
      </div>
      <AccountManager />
    </div>
  );
}
