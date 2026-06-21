import { AccountManager } from "@/components/account-manager";

export default function AccountsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">账户管理</h1>
        <p className="text-muted mt-1">管理券商账户、配置数据同步和导入交易记录</p>
      </div>
      <AccountManager />
    </div>
  );
}
