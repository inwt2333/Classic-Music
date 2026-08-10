import { ArrowLeft, KeyRound, LoaderCircle, LockKeyhole, Music, ShieldAlert } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";

export default function ReviewAccessGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  if (auth.loading || auth.profileLoading) {
    return <AccessPage icon={<LoaderCircle className="spin" size={26} />} title="正在确认管理员权限" />;
  }

  if (!auth.configured) {
    return <AccessPage icon={<ShieldAlert size={26} />} title="账号服务尚未配置" detail="审核工作台已锁定。" />;
  }

  if (!auth.user) {
    const submit = async (event: FormEvent) => {
      event.preventDefault();
      if (!email.trim()) return;
      setSending(true);
      setError("");
      try {
        await auth.signInWithPassword(email, password);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setSending(false);
      }
    };
    return (
      <AccessPage icon={<LockKeyhole size={26} />} title="管理员登录" detail="审核工作台仅向管理员账号开放。">
        <form className="review-access-form" onSubmit={submit}>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="管理员邮箱" required />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="密码" minLength={8} required />
          <button type="submit" disabled={sending}>{sending ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}{sending ? "正在登录" : "登录"}</button>
        </form>
        {error ? <p className="account-error" role="alert">{error}</p> : null}
        {!error && auth.authError ? <p className="account-error" role="alert">{auth.authError}</p> : null}
      </AccessPage>
    );
  }

  if (!auth.isAdmin) {
    return <AccessPage icon={<ShieldAlert size={26} />} title="没有审核权限" detail={`当前登录账号 ${auth.user.email ?? ""} 不是管理员。`} />;
  }

  if (!import.meta.env.DEV) {
    return <AccessPage icon={<LockKeyhole size={26} />} title="管理员身份已确认" detail="远程审核接口尚未启用，请使用本地管理环境。" />;
  }

  return children;
}

function AccessPage({ icon, title, detail, children }: { icon: ReactNode; title: string; detail?: string; children?: ReactNode }) {
  return (
    <main className="review-access-shell">
      <header className="app-header">
        <div className="brand-block"><Music size={22} /><div><strong>古典乐演出日历</strong><span>管理员审核</span></div></div>
        <a className="header-link" href="?profile=1"><ArrowLeft size={15} />返回个人页</a>
      </header>
      <section className="review-access-card">
        <span>{icon}</span><h1>{title}</h1>{detail ? <p>{detail}</p> : null}{children}
      </section>
    </main>
  );
}
